import { Injectable, Logger } from '@nestjs/common';
import type {
  ActionContext,
  ComplexSideEffect,
  SideEffectApplyResult,
  SideEffectConfig,
  SideEffectPreviewResult,
} from '../interfaces/side-effect.interface';
import { FinancialHoldStoreService } from './financial-hold-store.service';
import { SideEffect, mapLedgerEntryToSideEffect } from '../contracts/side-effect.contract';
import { PrismaService } from '../../prisma/prisma.service';

export type SideEffectLedgerEntry = {
  handler_id: string;
  kind?: string;
  status:
    | 'APPLIED'
    | 'APPLY_FAILED'
    | 'COMPENSATED'
    | 'COMPENSATION_FAILED'
    | 'CLEANING_IN_PROGRESS'
    | 'MANUAL_INTERVENTION_REQUIRED';
  retry_count?: number;
  last_error?: string | null;
  /** Backward-compatible; prefer resource_ref */
  hold_id?: string | null;
  /** Generic side effect resource reference (inventory/payment/holds/webhooks) */
  resource_ref?: { type: string; id: string } | null;
  /** Optional provider-level reference for reconciliation (transaction_id, pnr, order_ref, webhook_id, etc.) */
  provider_reference?: { provider: string; reference_type: string; reference_id: string } | null;
  /** Async cleanup governance */
  poll_count?: number;
  next_poll_after?: string | null; // ISO
  cleanup_deadline?: string | null; // ISO
  updated_at: string;
  side_effect?: SideEffect;
};

export class SideEffectApplyFailedError extends Error {
  readonly name = 'SideEffectApplyFailedError';
  constructor(
    message: string,
    public readonly side_effects_ledger: SideEffectLedgerEntry[],
  ) {
    super(message);
  }
}

@Injectable()
export class SideEffectRegistryService {
  private readonly logger = new Logger(SideEffectRegistryService.name);
  private readonly handlers = new Map<string, ComplexSideEffect>();
  private static readonly RETRY_POLICY_ACTION = '__admin__.retry_policy';

  constructor(
    private readonly financialHoldStore: FinancialHoldStoreService,
    private readonly prisma?: PrismaService,
  ) {}

  register(h: ComplexSideEffect): void {
    if (this.handlers.has(h.id)) {
      this.logger.warn(`SideEffect ${h.id} already registered, overwriting`);
    }
    this.handlers.set(h.id, h);
  }

  get(id: string): ComplexSideEffect | undefined {
    return this.handlers.get(id);
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  list(): ComplexSideEffect[] {
    return Array.from(this.handlers.values());
  }

  async previewMany(ctx: ActionContext, configs: SideEffectConfig[]): Promise<SideEffectPreviewResult[]> {
    const out: SideEffectPreviewResult[] = [];
    for (const c of configs) {
      const id = String(c?.handlerId ?? '');
      const h = this.handlers.get(id);
      if (!h) continue;
      try {
        const r = await h.preview(ctx, c?.params);
        if (r) out.push(r);
      } catch (e: any) {
        this.logger.warn(`[SideEffectRegistry] preview failed: id=${id}, err=${e?.message ?? String(e)}`);
      }
    }
    return out;
  }

  async applyMany(ctx: ActionContext, configs: SideEffectConfig[]): Promise<SideEffectApplyResult[]> {
    const out: SideEffectApplyResult[] = [];
    const errors: string[] = [];
    const applied: Array<{ id: string; handler: ComplexSideEffect; config: SideEffectConfig }> = [];
    const ledger: SideEffectLedgerEntry[] = [];
    const retryPolicyByType = await this.loadRetryPoliciesBySideEffectType();
    for (const c of configs) {
      const id = String(c?.handlerId ?? '');
      const h = this.handlers.get(id);
      if (!h) continue;
      try {
        const retryPolicy = this.resolveRetryPolicyForHandlerKind(h.kind, retryPolicyByType);
        const { result: r, retryCount } = await this.applyWithRetry(h, ctx, c, retryPolicy);
        if (r) {
          out.push(r);
          applied.push({ id, handler: h, config: c });
          const holds = (r.state_patch as any)?.side_effects?.financial_holds;
          const inventoryLocks = (r.state_patch as any)?.side_effects?.inventory_locks;
          const hold_id =
            Array.isArray(holds) && holds[0] && (holds[0] as any).hold_id != null
              ? String((holds[0] as any).hold_id)
              : null;
          const inventory_lock_id =
            Array.isArray(inventoryLocks) && inventoryLocks[0] && (inventoryLocks[0] as any).lock_id != null
              ? String((inventoryLocks[0] as any).lock_id)
              : null;
          ledger.push({
            handler_id: id,
            kind: h.kind,
            status: 'APPLIED',
            retry_count: retryCount,
            last_error: null,
            hold_id,
            resource_ref: hold_id
              ? { type: 'FINANCIAL_HOLD', id: hold_id }
              : inventory_lock_id
                ? { type: 'INVENTORY_LOCK', id: inventory_lock_id }
                : null,
            provider_reference: null,
            updated_at: new Date().toISOString(),
          });
          const latest = ledger[ledger.length - 1]!;
          latest.side_effect = mapLedgerEntryToSideEffect(latest, {
            actionId: String(ctx.action_id),
            requestId: String(ctx.request_id),
          });
          // Minimal persistence hook: store FINANCIAL_HOLD hold tokens when present.
          if (Array.isArray(holds)) {
            for (const it of holds) {
              const hold_id = String(it?.hold_id ?? '');
              const expires_at = String(it?.expires_at ?? '');
              if (!hold_id || !expires_at) continue;
              await this.financialHoldStore.upsert({
                hold_id,
                action_id: String(it?.action_id ?? ctx.action_id),
                action_name: String(it?.action_name ?? ctx.action_name),
                trip_id: String(ctx.trip_id),
                request_id: String(ctx.request_id),
                ...(typeof it?.amount === 'number' && Number.isFinite(it.amount) ? { amount: it.amount } : {}),
                ...(it?.currency != null ? { currency: String(it.currency) } : {}),
                expires_at,
              });
            }
          }
        }
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        this.logger.warn(`[SideEffectRegistry] apply failed: id=${id}, err=${msg}`);
        errors.push(`${id}: ${msg}`);
        const retryCount = typeof e?.retry_count === 'number' ? e.retry_count : 0;
        ledger.push({
          handler_id: id,
          kind: h.kind,
          status: 'APPLY_FAILED',
          retry_count: retryCount,
          last_error: msg,
          hold_id: null,
          resource_ref: null,
          provider_reference: null,
          updated_at: new Date().toISOString(),
        });
        const latest = ledger[ledger.length - 1]!;
        latest.side_effect = mapLedgerEntryToSideEffect(latest, {
          actionId: String(ctx.action_id),
          requestId: String(ctx.request_id),
        });

        // Saga compensation (best-effort): rollback already-applied side effects in reverse order.
        for (const a of applied.slice().reverse()) {
          try {
            if (typeof a.handler.rollback === 'function') {
              const rr = await a.handler.rollback(ctx, a.config?.params);
              const released = (rr as any)?.state_patch?.side_effects?.financial_holds_released;
              const inventoryReleased = (rr as any)?.state_patch?.side_effects?.inventory_locks_released;
              if (Array.isArray(released)) {
                for (const rel of released) {
                  const holdId = String(rel?.hold_id ?? rel ?? '');
                  if (holdId) await this.financialHoldStore.expire(holdId).catch(() => undefined);
                }
              }
              const invLockId =
                Array.isArray(inventoryReleased) && inventoryReleased[0] && (inventoryReleased[0] as any).lock_id != null
                  ? String((inventoryReleased[0] as any).lock_id)
                  : null;
              ledger.push({
                handler_id: a.id,
                kind: a.handler.kind,
                status: 'COMPENSATED',
                retry_count: 0,
                last_error: null,
                hold_id: null,
                resource_ref: invLockId ? { type: 'INVENTORY_LOCK', id: invLockId } : null,
                provider_reference: null,
                updated_at: new Date().toISOString(),
              });
              const latest = ledger[ledger.length - 1]!;
              latest.side_effect = mapLedgerEntryToSideEffect(latest, {
                actionId: String(ctx.action_id),
                requestId: String(ctx.request_id),
              });
            } else if (typeof a.handler.expire === 'function') {
              await a.handler.expire(ctx, a.config?.params);
              ledger.push({
                handler_id: a.id,
                kind: a.handler.kind,
                status: 'COMPENSATED',
                retry_count: 0,
                last_error: null,
                hold_id: null,
                resource_ref: null,
                provider_reference: null,
                updated_at: new Date().toISOString(),
              });
              const latest = ledger[ledger.length - 1]!;
              latest.side_effect = mapLedgerEntryToSideEffect(latest, {
                actionId: String(ctx.action_id),
                requestId: String(ctx.request_id),
              });
            } else if (a.handler.kind === 'FINANCIAL_HOLD') {
              // Fallback: release synthetic hold token if apply persisted it.
              const holdId = `hold_${String(ctx.action_id)}`;
              await this.financialHoldStore.expire(holdId).catch(() => undefined);
              ledger.push({
                handler_id: a.id,
                kind: a.handler.kind,
                status: 'COMPENSATED',
                retry_count: 0,
                last_error: null,
                hold_id: holdId,
                resource_ref: { type: 'FINANCIAL_HOLD', id: holdId },
                provider_reference: null,
                updated_at: new Date().toISOString(),
              });
              const latest = ledger[ledger.length - 1]!;
              latest.side_effect = mapLedgerEntryToSideEffect(latest, {
                actionId: String(ctx.action_id),
                requestId: String(ctx.request_id),
              });
            }
          } catch (re: any) {
            this.logger.warn(
              `[SideEffectRegistry] rollback failed: id=${a.id}, err=${re?.message ?? String(re)}`,
            );
            ledger.push({
              handler_id: a.id,
              kind: a.handler.kind,
              status: 'COMPENSATION_FAILED',
              retry_count: 1,
              last_error: re?.message ?? String(re),
              hold_id: null,
              resource_ref: null,
              provider_reference: null,
              updated_at: new Date().toISOString(),
            });
            const latest = ledger[ledger.length - 1]!;
            latest.side_effect = mapLedgerEntryToSideEffect(latest, {
              actionId: String(ctx.action_id),
              requestId: String(ctx.request_id),
            });
          }
        }

        break;
      }
    }
    if (errors.length) {
      throw new SideEffectApplyFailedError(`SideEffect apply failed: ${errors.join('; ')}`, ledger);
    }
    return out;
  }

  private async loadRetryPoliciesBySideEffectType(): Promise<
    Map<string, { retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff'; maxRetry: number; intervalMs: number; enabled: boolean }>
  > {
    const out = new Map<
      string,
      { retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff'; maxRetry: number; intervalMs: number; enabled: boolean }
    >();
    if (!this.prisma?.isDbConnected?.()) return out;
    try {
      const rows = await this.prisma.decisionRuleConfig.findMany({
        where: {
          actionName: SideEffectRegistryService.RETRY_POLICY_ACTION,
          isActive: true,
        },
      });
      for (const row of rows) {
        const p = row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? (row.params as any) : {};
        const sideEffectType = String(p.sideEffectType ?? '').trim().toUpperCase();
        const retryStrategyRaw = String(p.retryStrategy ?? 'none').trim().toLowerCase();
        if (!sideEffectType) continue;
        const retryStrategy =
          retryStrategyRaw === 'fixed_interval' || retryStrategyRaw === 'exponential_backoff'
            ? retryStrategyRaw
            : 'none';
        out.set(sideEffectType, {
          retryStrategy,
          maxRetry: Math.max(0, Math.floor(Number(p.maxRetry ?? 0))),
          intervalMs: Math.max(0, Math.floor(Number(p.intervalMs ?? 0))),
          enabled: Boolean(p.enabled),
        });
      }
      return out;
    } catch (e: any) {
      this.logger.warn(`[SideEffectRegistry] load retry policies failed: ${e?.message ?? String(e)}`);
      return out;
    }
  }

  private resolveRetryPolicyForHandlerKind(
    kind: string,
    byType: Map<
      string,
      { retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff'; maxRetry: number; intervalMs: number; enabled: boolean }
    >,
  ): { retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff'; maxRetry: number; intervalMs: number; enabled: boolean } {
    const k = String(kind ?? '').trim().toUpperCase();
    const mappedType = k === 'RESOURCE_LOCK' ? 'RESOURCE_LOCK' : k;
    const p = byType.get(mappedType);
    if (!p || !p.enabled) {
      return { retryStrategy: 'none', maxRetry: 0, intervalMs: 0, enabled: false };
    }
    return p;
  }

  private async applyWithRetry(
    handler: ComplexSideEffect,
    ctx: ActionContext,
    config: SideEffectConfig,
    policy: { retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff'; maxRetry: number; intervalMs: number; enabled: boolean },
  ): Promise<{ result: SideEffectApplyResult | null; retryCount: number }> {
    let attempt = 0;
    while (true) {
      try {
        const result = await handler.apply(ctx, config?.params);
        return { result, retryCount: attempt };
      } catch (e: any) {
        if (!policy.enabled || policy.maxRetry <= 0 || attempt >= policy.maxRetry) {
          e.retry_count = attempt;
          throw e;
        }
        attempt += 1;
        const delay =
          policy.retryStrategy === 'fixed_interval'
            ? policy.intervalMs
            : policy.retryStrategy === 'exponential_backoff'
              ? policy.intervalMs * Math.pow(2, attempt - 1)
              : 0;
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }
}

