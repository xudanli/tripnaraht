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
    take: number;
    skip: number;
  }): Promise<{ rows: AgentActionLog[]; total: number }> {
    if (!this.isEnabled()) return { rows: [], total: 0 };
    const where: Prisma.AgentActionLogWhereInput = {
      ...(opts.status?.trim() ? { status: opts.status.trim() } : {}),
      ...(opts.tripId?.trim() ? { tripId: opts.tripId.trim() } : {}),
    };
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
      this.logger.warn(`listPaginated failed: ${e?.message ?? e}`);
      return { rows: [], total: 0 };
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
