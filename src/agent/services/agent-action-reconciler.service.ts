import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentActionLogService } from './agent-action-log.service';
import { FinancialHoldStoreService } from './financial-hold-store.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';
import { SideEffectCleanupAdapterRegistry } from './side-effect-cleanup-adapter.registry';
import { EventTelemetryService, AgentEventType } from './event-telemetry.service';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';

type SideEffectLedgerEntry = {
  handler_id: string;
  status:
    | 'APPLIED'
    | 'APPLY_FAILED'
    | 'COMPENSATED'
    | 'COMPENSATION_FAILED'
    | 'CLEANING_IN_PROGRESS'
    | 'MANUAL_INTERVENTION_REQUIRED';
  retry_count?: number;
  last_error?: string | null;
  hold_id?: string | null;
  resource_ref?: { type: string; id: string } | null;
  provider_reference?: { provider: string; reference_type: string; reference_id: string } | null;
  poll_count?: number;
  next_poll_after?: string | null;
  cleanup_deadline?: string | null;
  updated_at?: string;
};

@Injectable()
export class AgentActionReconcilerService {
  private readonly logger = new Logger(AgentActionReconcilerService.name);

  private computeNextPollAfter(pollCount: number): string {
    // Exponential backoff (minutes): 2, 4, 8, 16, 32... capped at 60 minutes.
    const minutes = Math.min(60, Math.max(2, 2 ** Math.min(10, pollCount + 1)));
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  private defaultCleanupDeadlineIso(): string {
    // Stop-loss line: 24h from now.
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  constructor(
    @Optional() private readonly agentActionLog?: AgentActionLogService,
    private readonly financialHoldStore?: FinancialHoldStoreService,
    @Optional() private readonly cleanupAdapters?: SideEffectCleanupAdapterRegistry,
    @Optional() private readonly telemetry?: EventTelemetryService,
    @Optional() private readonly metrics?: PrometheusMetricsService,
  ) {}

  /**
   * Single reconciliation tick (cron-friendly).
   * - scans recent FAILED/COMMITTED logs
   * - attempts to expire dangling FINANCIAL_HOLD tokens
   * - marks log as CLEANED when no COMPENSATION_FAILED remains
   */
  async reconcileOnce(opts?: { take?: number }): Promise<{
    scanned: number;
    attempted: number;
    cleaned: number;
  }> {
    const take = typeof opts?.take === 'number' && Number.isFinite(opts.take) ? Math.max(1, Math.floor(opts.take)) : 50;
    if (!this.agentActionLog || !this.agentActionLog.isEnabled?.()) {
      return { scanned: 0, attempted: 0, cleaned: 0 };
    }
    let attempted = 0;
    let cleaned = 0;

    const staleMs = 5 * 60 * 1000;
    const statuses = [
      AGENT_ACTION_LOG_STATUS.FAILED,
      AGENT_ACTION_LOG_STATUS.COMMITTED,
      AGENT_ACTION_LOG_STATUS.CLEANING_IN_PROGRESS,
      AGENT_ACTION_LOG_STATUS.MANUAL_INTERVENTION_REQUIRED,
    ];
    const rows: any[] = await (this.agentActionLog as any).listStaleForReconciliation?.({
      statuses,
      older_than_ms: staleMs,
      take,
    }).catch(() => []) ?? [];
    if (rows.length === 0) {
      const fallback: any[] = [];
      for (const st of statuses) {
        const page = await this.agentActionLog.listPaginated({ status: st, take, skip: 0 });
        fallback.push(...(page.rows as any[]));
      }
      // best-effort stale filter (updatedAt may be missing in mocks)
      const cutoff = Date.now() - staleMs;
      for (const r of fallback) {
        const t = Date.parse(String(r?.updatedAt ?? r?.updated_at ?? ''));
        if (!Number.isFinite(t) || t <= cutoff) rows.push(r);
      }
    }

    let activeCleaningTasks = 0;
    for (const row of rows) {
      const payload = row?.payload && typeof row.payload === 'object' ? (row.payload as any) : null;
      const realized = payload?.realized_state && typeof payload.realized_state === 'object' ? payload.realized_state : null;
      const ledger: SideEffectLedgerEntry[] = Array.isArray(realized?.side_effects_ledger)
        ? realized.side_effects_ledger
        : [];
      if (ledger.length === 0) continue;

      activeCleaningTasks += ledger.filter((e) => e?.status === 'CLEANING_IN_PROGRESS').length;

      const pending = ledger.filter(
        (e) =>
          e?.status === 'COMPENSATION_FAILED' ||
          e?.status === 'APPLIED' ||
          e?.status === 'CLEANING_IN_PROGRESS',
      );
      if (pending.length === 0) continue;

      let anyCleaningInProgress = false;
      let anyManualIntervention = false;
      const nowMs = Date.now();
      const maxPollAttempts = 12;

      // v1+: reconcile FINANCIAL_HOLD + adapter-dispatched async resources.
      for (const e of pending) {
        if (e?.status === 'MANUAL_INTERVENTION_REQUIRED') {
          anyManualIntervention = true;
          continue;
        }

        // Poll guard: if next_poll_after is in the future, skip this entry.
        const nextPollMs = e?.next_poll_after ? Date.parse(String(e.next_poll_after)) : NaN;
        if (Number.isFinite(nextPollMs) && nextPollMs > nowMs) {
          continue;
        }

        // Stop-loss: deadline exceeded => manual intervention required.
        const deadlineMs = e?.cleanup_deadline ? Date.parse(String(e.cleanup_deadline)) : NaN;
        if (Number.isFinite(deadlineMs) && deadlineMs <= nowMs) {
          anyManualIntervention = true;
          e.status = 'MANUAL_INTERVENTION_REQUIRED';
          e.last_error = e.last_error ?? 'cleanup_deadline_exceeded';
          e.updated_at = new Date().toISOString();
          continue;
        }

        const pollCount = typeof e.poll_count === 'number' && Number.isFinite(e.poll_count) ? e.poll_count : 0;
        if (pollCount >= maxPollAttempts) {
          anyManualIntervention = true;
          e.status = 'MANUAL_INTERVENTION_REQUIRED';
          e.last_error = e.last_error ?? 'max_poll_attempts_exceeded';
          e.updated_at = new Date().toISOString();
          continue;
        }

        const holdId =
          e?.resource_ref?.type === 'FINANCIAL_HOLD' && e?.resource_ref?.id
            ? String(e.resource_ref.id)
            : e?.hold_id
              ? String(e.hold_id)
              : null;
        if (holdId) {
          attempted += 1;
          const ok = await this.financialHoldStore?.expire?.(holdId).catch(() => false);
          if (ok) {
            e.status = 'COMPENSATED';
            e.last_error = null;
            e.updated_at = new Date().toISOString();
          } else {
            e.status = 'COMPENSATION_FAILED';
            e.retry_count = (typeof e.retry_count === 'number' ? e.retry_count : 0) + 1;
            e.last_error = e.last_error ?? 'expire_failed';
            e.updated_at = new Date().toISOString();
          }
          continue;
        }

        // Adapter-based cleanup for non-hold resources (payment/inventory/webhooks)
        const rr = e?.resource_ref?.type && e?.resource_ref?.id ? e.resource_ref : null;
        const pr = e?.provider_reference ?? null;
        const adapter = rr ? this.cleanupAdapters?.find(rr.type, pr?.provider ?? null) : undefined;
        if (!rr || !adapter) continue;

        attempted += 1;
        const phase = e.status === 'CLEANING_IN_PROGRESS' ? 'POLL' : 'START';
        const res = await adapter
          .cleanup({
            phase,
            resource_ref: rr,
            provider_reference: pr,
            ledger_entry: e as any,
          })
          .catch((err: any) => ({ status: 'FAILED', last_error: err?.message ?? String(err) } as const));

        if (res.status === 'PENDING') {
          anyCleaningInProgress = true;
          e.status = 'CLEANING_IN_PROGRESS';
          e.last_error = null;
          e.poll_count = pollCount + 1;
          e.cleanup_deadline = e.cleanup_deadline ?? this.defaultCleanupDeadlineIso();
          e.next_poll_after = this.computeNextPollAfter(e.poll_count);
          e.updated_at = new Date().toISOString();
        } else if (res.status === 'DONE') {
          e.status = 'COMPENSATED';
          e.last_error = null;
          e.next_poll_after = null;
          e.updated_at = new Date().toISOString();
        } else {
          e.status = 'COMPENSATION_FAILED';
          e.retry_count = (typeof e.retry_count === 'number' ? e.retry_count : 0) + 1;
          e.last_error = res.last_error ?? 'cleanup_failed';
          e.poll_count = pollCount + 1;
          e.cleanup_deadline = e.cleanup_deadline ?? this.defaultCleanupDeadlineIso();
          e.next_poll_after = this.computeNextPollAfter(e.poll_count);
          e.updated_at = new Date().toISOString();
        }
      }

      const stillFailed = ledger.some(
        (e) =>
          e?.status === 'COMPENSATION_FAILED' ||
          e?.status === 'APPLIED' ||
          e?.status === 'CLEANING_IN_PROGRESS' ||
          e?.status === 'MANUAL_INTERVENTION_REQUIRED',
      );
      const maxRetryCount = ledger.reduce((acc, entry) => {
        const retryCount = Number((entry as any)?.retry_count ?? 0);
        return Number.isFinite(retryCount) ? Math.max(acc, Math.floor(retryCount)) : acc;
      }, 0);
      await this.agentActionLog.mergePayload(row.id, {
        realized_state: { ...realized, side_effects_ledger: ledger, max_retry_count: maxRetryCount },
        reconciliation: {
          last_attempt_at: new Date().toISOString(),
          still_failed: stillFailed,
        },
      });

      if (stillFailed && anyManualIntervention) {
        await this.agentActionLog.updateStatus(row.id, AGENT_ACTION_LOG_STATUS.MANUAL_INTERVENTION_REQUIRED);

        // emit structured ops event (best-effort)
        const stuckEntry =
          ledger.find((e) => e?.status === 'MANUAL_INTERVENTION_REQUIRED') ??
          ledger.find((e) => e?.status === 'COMPENSATION_FAILED') ??
          ledger[0];
        const resType = stuckEntry?.resource_ref?.type ?? (stuckEntry?.hold_id ? 'FINANCIAL_HOLD' : null);
        const provider = stuckEntry?.provider_reference?.provider ?? null;
        const createdAtMs = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
        const elapsedMs = Number.isFinite(createdAtMs) ? Math.max(0, Date.now() - createdAtMs) : null;
        const decisionContext =
          payload?.decision_contract?.semantic_signature?.constraint_hash ??
          payload?.decision_contract?.semantic_signature?.env_hash ??
          payload?.context_signature ??
          null;
        const requestId = row?.requestId ?? payload?.request_id ?? payload?.requestId ?? 'unknown';

        this.metrics?.incSagaManualIntervention(resType, provider);
        this.telemetry?.recordEvent({
          type: AgentEventType.SAGA_STUCK,
          request_id: String(requestId),
          data: {
            log_id: row.id,
            status: AGENT_ACTION_LOG_STATUS.MANUAL_INTERVENTION_REQUIRED,
            failed_resource: stuckEntry?.resource_ref ?? null,
            provider_reference: stuckEntry?.provider_reference ?? null,
            last_error: stuckEntry?.last_error ?? null,
            poll_count: stuckEntry?.poll_count ?? null,
            next_poll_after: stuckEntry?.next_poll_after ?? null,
            cleanup_deadline: stuckEntry?.cleanup_deadline ?? null,
            elapsed_ms: elapsedMs,
            decision_context: decisionContext,
          },
        });
      }

      if (stillFailed && anyCleaningInProgress) {
        await this.agentActionLog.updateStatus(row.id, AGENT_ACTION_LOG_STATUS.CLEANING_IN_PROGRESS);
      }

      if (!stillFailed) {
        cleaned += 1;
        await this.agentActionLog.updateStatus(row.id, AGENT_ACTION_LOG_STATUS.CLEANED);
        this.logger.log(`CLEANED saga log id=${row.id}`);

        const createdAtMs = row?.createdAt ? new Date(row.createdAt).getTime() : NaN;
        if (Number.isFinite(createdAtMs)) {
          const latencySec = Math.max(0, (Date.now() - createdAtMs) / 1000);
          const first = ledger[0];
          const resType = first?.resource_ref?.type ?? (first?.hold_id ? 'FINANCIAL_HOLD' : null);
          const provider = first?.provider_reference?.provider ?? null;
          this.metrics?.observeSagaCleanupLatencySeconds(latencySec, resType, provider);
        }
      }
    }

    this.metrics?.setSagaReconciliationActiveTasks(activeCleaningTasks);
    return { scanned: rows.length, attempted, cleaned };
  }
}

