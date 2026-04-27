import { Injectable, Logger } from '@nestjs/common';
import type {
  ActionContext,
  ComplexSideEffect,
  SideEffectApplyResult,
  SideEffectConfig,
  SideEffectPreviewResult,
} from '../interfaces/side-effect.interface';
import { FinancialHoldStoreService } from './financial-hold-store.service';

@Injectable()
export class SideEffectRegistryService {
  private readonly logger = new Logger(SideEffectRegistryService.name);
  private readonly handlers = new Map<string, ComplexSideEffect>();

  constructor(private readonly financialHoldStore: FinancialHoldStoreService) {}

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
    for (const c of configs) {
      const id = String(c?.handlerId ?? '');
      const h = this.handlers.get(id);
      if (!h) continue;
      try {
        const r = await h.apply(ctx, c?.params);
        if (r) {
          out.push(r);
          // Minimal persistence hook: store FINANCIAL_HOLD hold tokens when present.
          const holds = (r.state_patch as any)?.side_effects?.financial_holds;
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
      }
    }
    if (errors.length) {
      throw new Error(`SideEffect apply failed: ${errors.join('; ')}`);
    }
    return out;
  }
}

