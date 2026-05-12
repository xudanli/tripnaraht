import { Injectable, Logger, Optional } from '@nestjs/common';
import type { AgentActionLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';

export type AgentActionLogCreateInitInput = {
  requestId: string;
  tripId: string;
  actionId: string;
  actionName: string;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
};

/**
 * Persists per-action commit saga state for audit and future recovery workers
 * (e.g. retry POST_APPLY when status=COMMITTED is stale).
 */
@Injectable()
export class AgentActionLogService {
  private readonly logger = new Logger(AgentActionLogService.name);
  private minRetryFilterFallbackWarned = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  isEnabled(): boolean {
    return Boolean(this.prisma?.isDbConnected());
  }

  async createInit(input: AgentActionLogCreateInitInput): Promise<string | undefined> {
    if (!this.isEnabled()) return undefined;
    try {
      const row = await this.prisma!.agentActionLog.create({
        data: {
          requestId: input.requestId,
          tripId: input.tripId,
          actionId: input.actionId,
          actionName: input.actionName,
          status: AGENT_ACTION_LOG_STATUS.INIT,
          idempotencyKey: input.idempotencyKey ?? null,
          payload: input.payload === undefined ? undefined : (input.payload as object),
        },
      });
      return row.id;
    } catch (e: any) {
      this.logger.warn(`createInit failed: ${e?.message ?? e}`);
      return undefined;
    }
  }

  async updateStatus(logId: string | undefined, status: string, lastError?: string | null): Promise<void> {
    if (!this.isEnabled() || !logId) return;
    try {
      const now = new Date();
      await this.prisma!.agentActionLog.update({
        where: { id: logId },
        data: {
          status,
          ...(lastError !== undefined ? { lastError: lastError ?? null } : {}),
          ...(status === AGENT_ACTION_LOG_STATUS.COMMITTED ? { committedAt: now } : {}),
          ...(status === AGENT_ACTION_LOG_STATUS.SIDE_EFFECT_DONE ? { sideEffectDoneAt: now } : {}),
          ...(status === AGENT_ACTION_LOG_STATUS.FAILED ? { failedAt: now } : {}),
        },
      });
    } catch (e: any) {
      this.logger.warn(`updateStatus failed id=${logId}: ${e?.message ?? e}`);
    }
  }

  /**
   * Best-effort merge patch into `payload` JSON.
   * Used to append "realized" settlement info after side effects complete.
   */
  async mergePayload(logId: string | undefined, patch: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled() || !logId) return;
    try {
      const existing = await this.prisma!.agentActionLog.findUnique({
        where: { id: logId },
        select: { payload: true },
      });
      const cur = existing?.payload && typeof existing.payload === 'object' ? (existing.payload as any) : {};
      const next = { ...cur, ...patch };
      await this.prisma!.agentActionLog.update({
        where: { id: logId },
        data: { payload: next as object },
      });
    } catch (e: any) {
      this.logger.warn(`mergePayload failed id=${logId}: ${e?.message ?? e}`);
    }
  }

  async listPaginated(opts: {
    status?: string;
    tripId?: string;
    createdAtFrom?: Date;
    createdAtTo?: Date;
    hasEvidenceRequirementContext?: boolean;
    hasApplyFailed?: boolean;
    hasCompensationFailed?: boolean;
    minRetryCount?: number;
    hasManualInterventionRequired?: boolean;
    take: number;
    skip: number;
  }): Promise<{ rows: AgentActionLog[]; total: number }> {
    if (!this.isEnabled()) return { rows: [], total: 0 };
    const minRetryCount =
      typeof opts.minRetryCount === 'number' && Number.isFinite(opts.minRetryCount)
        ? Math.max(0, Math.floor(opts.minRetryCount))
        : undefined;
    const andFilters: Prisma.AgentActionLogWhereInput[] = [];
    if (typeof opts.hasEvidenceRequirementContext === 'boolean') {
      andFilters.push({
        payload: {
          path: ['evidence_requirement_context'],
          ...(opts.hasEvidenceRequirementContext ? { not: null } : { equals: null }),
        } as any,
      });
    }
    if (typeof opts.hasApplyFailed === 'boolean') {
      andFilters.push({
        payload: {
          path: ['realized_state', 'side_effects_ledger'],
          ...(opts.hasApplyFailed
            ? { array_contains: [{ status: 'APPLY_FAILED' }] }
            : { not: { array_contains: [{ status: 'APPLY_FAILED' }] } }),
        } as any,
      });
    }
    if (typeof opts.hasCompensationFailed === 'boolean') {
      andFilters.push({
        payload: {
          path: ['realized_state', 'side_effects_ledger'],
          ...(opts.hasCompensationFailed
            ? { array_contains: [{ status: 'COMPENSATION_FAILED' }] }
            : { not: { array_contains: [{ status: 'COMPENSATION_FAILED' }] } }),
        } as any,
      });
    }
    if (typeof opts.hasManualInterventionRequired === 'boolean') {
      andFilters.push({
        payload: {
          path: ['realized_state', 'side_effects_ledger'],
          ...(opts.hasManualInterventionRequired
            ? { array_contains: [{ status: 'MANUAL_INTERVENTION_REQUIRED' }] }
            : { not: { array_contains: [{ status: 'MANUAL_INTERVENTION_REQUIRED' }] } }),
        } as any,
      });
    }
    const whereBase: Prisma.AgentActionLogWhereInput = {
      ...(opts.status?.trim() ? { status: opts.status.trim() } : {}),
      ...(opts.tripId?.trim() ? { tripId: opts.tripId.trim() } : {}),
      ...(opts.createdAtFrom || opts.createdAtTo
        ? {
            createdAt: {
              ...(opts.createdAtFrom ? { gte: opts.createdAtFrom } : {}),
              ...(opts.createdAtTo ? { lte: opts.createdAtTo } : {}),
            },
          }
        : {}),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };
    const where: Prisma.AgentActionLogWhereInput =
      minRetryCount !== undefined
        ? ({
            ...whereBase,
            AND: [
              ...((whereBase as any).AND ?? []),
              {
                payload: {
                  path: ['realized_state', 'max_retry_count'],
                  gte: minRetryCount,
                },
              },
            ],
          } as any)
        : whereBase;
    try {
      const [rows, total] = await Promise.all([
        this.prisma!.agentActionLog.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: opts.take,
          skip: opts.skip,
        }),
        this.prisma!.agentActionLog.count({ where }),
      ]);
      return { rows, total };
    } catch (e: any) {
      if (minRetryCount !== undefined) {
        try {
          if (!this.minRetryFilterFallbackWarned) {
            this.logger.warn(`listPaginated minRetryCount DB filter fallback: ${e?.message ?? e}`);
            this.minRetryFilterFallbackWarned = true;
          }
          const allRows = await this.prisma!.agentActionLog.findMany({
            where: whereBase,
            orderBy: { updatedAt: 'desc' },
          });
          const filtered = allRows.filter((row: any) => {
            const maxRetryFromPayload = Number(row?.payload?.realized_state?.max_retry_count ?? NaN);
            if (Number.isFinite(maxRetryFromPayload)) {
              return Math.floor(maxRetryFromPayload) >= minRetryCount;
            }
            const ledger = row?.payload?.realized_state?.side_effects_ledger;
            if (!Array.isArray(ledger)) return false;
            const maxRetryFromLedger = ledger.reduce((acc: number, it: any) => {
              const v = Number(it?.retry_count ?? 0);
              return Number.isFinite(v) ? Math.max(acc, Math.floor(v)) : acc;
            }, 0);
            return maxRetryFromLedger >= minRetryCount;
          });
          return {
            rows: filtered.slice(opts.skip, opts.skip + opts.take),
            total: filtered.length,
          };
        } catch (fallbackErr: any) {
          this.logger.warn(`listPaginated fallback failed: ${fallbackErr?.message ?? fallbackErr}`);
        }
      }
      this.logger.warn(`listPaginated failed: ${e?.message ?? e}`);
      return { rows: [], total: 0 };
    }
  }

  /**
   * Reconciliation scan helper:
   * only logs older than a cutoff to avoid interfering with in-flight sagas.
   */
  async listStaleForReconciliation(opts: {
    statuses: string[];
    older_than_ms: number;
    take: number;
  }): Promise<AgentActionLog[]> {
    if (!this.isEnabled()) return [];
    const take = Math.max(1, Math.floor(opts.take));
    const statuses = Array.isArray(opts.statuses) ? opts.statuses.filter(Boolean) : [];
    if (statuses.length === 0) return [];
    const olderMs =
      typeof opts.older_than_ms === 'number' && Number.isFinite(opts.older_than_ms) ? Math.max(0, opts.older_than_ms) : 0;
    const cutoff = new Date(Date.now() - olderMs);
    try {
      return await this.prisma!.agentActionLog.findMany({
        where: {
          status: { in: statuses as any },
          updatedAt: { lte: cutoff },
        },
        orderBy: { updatedAt: 'asc' },
        take,
      });
    } catch (e: any) {
      this.logger.warn(`listStaleForReconciliation failed: ${e?.message ?? e}`);
      return [];
    }
  }

  async findById(id: string): Promise<AgentActionLog | null> {
    if (!this.isEnabled()) return null;
    try {
      return await this.prisma!.agentActionLog.findUnique({ where: { id } });
    } catch (e: any) {
      this.logger.warn(`findById failed: ${e?.message ?? e}`);
      return null;
    }
  }
}
