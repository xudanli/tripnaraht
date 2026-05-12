// src/agent/context-engine/services/trip-task-memory.service.ts
/**
 * Trip Task Memory Service
 *
 * 旅行任务记忆：存储当前行程状态、已选路线、中间决策
 * - 写入时机：每次子 Agent 完成、每次 writeBack
 * - 读取时机：Orchestrator build Context 时
 * - 存储：Redis（TTL=7d）+ 内存 fallback
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';
import type {
  TripTaskMemory,
  TripTaskPhase,
  TripTaskRecoveryAuditLine,
} from '../interfaces/trip-task-memory.interface';

const CACHE_PREFIX = 'trip_task_memory:';
const DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 天（秒）

@Injectable()
export class TripTaskMemoryService {
  private readonly logger = new Logger(TripTaskMemoryService.name);
  private readonly memoryFallback = new Map<string, TripTaskMemory>();

  constructor(@Optional() private readonly redis?: RedisService) {
    if (this.redis) {
      this.logger.log('TripTaskMemory 使用 Redis 存储（TTL 7 天）');
    } else {
      // Phase 0 战略收敛：Redis 不可用应告警，不静默 fallback
      this.logger.error(
        '[Phase0] TripTaskMemory Redis 未注入，使用内存 fallback。生产环境必须配置 Redis，否则任务状态会丢失且多实例不共享。请运维检查 Redis 连接。',
      );
    }
  }

  async get(tripId: string): Promise<TripTaskMemory | null> {
    const key = `${CACHE_PREFIX}${tripId}`;

    if (this.redis) {
      try {
        const cached = await this.redis.get<TripTaskMemory>(key);
        if (cached) return cached;
      } catch (e: any) {
        this.logger.error(
          `[Phase0] TripTaskMemory Redis get 失败，降级到内存: ${e?.message}。任务状态可能丢失，请运维检查 Redis。`,
        );
      }
    }

    return this.memoryFallback.get(tripId) ?? null;
  }

  async set(memory: TripTaskMemory): Promise<void> {
    const key = `${CACHE_PREFIX}${memory.tripId}`;
    const updated: TripTaskMemory = {
      ...memory,
      lastUpdated: new Date().toISOString(),
    };

    if (this.redis) {
      try {
        await this.redis.set(key, updated, DEFAULT_TTL);
      } catch (e: any) {
        this.logger.error(
          `[Phase0] TripTaskMemory Redis set 失败，降级到内存: ${e?.message}。任务状态可能丢失，请运维检查 Redis。`,
        );
      }
    }

    this.memoryFallback.set(memory.tripId, updated);
  }

  async update(
    tripId: string,
    delta: Partial<
      Pick<
        TripTaskMemory,
        | 'currentPhase'
        | 'selectedRouteDirectionId'
        | 'decisionLogSummary'
        | 'artifactsRefs'
        | 'goal'
        | 'constraints'
        | 'execution_state'
        | 'risk_state'
        | 'history'
        | 'recovery_audit_tail'
      >
    >,
  ): Promise<void> {
    const existing = await this.get(tripId);
    const base: TripTaskMemory =
      existing ??
      {
        tripId,
        currentPhase: 'intake',
        decisionLogSummary: '',
        artifactsRefs: [],
        lastUpdated: new Date().toISOString(),
      };
    const merged: TripTaskMemory = {
      ...base,
      ...delta,
      tripId,
      lastUpdated: new Date().toISOString(),
    };
    await this.set(merged);
  }

  /**
   * 从 writeBack 数据更新任务记忆（供 ContextEngineerService 调用）
   */
  /**
   * PRD I3：replan 请求携带上一版版本/快照时，追加一条 `history`（供 Context 块与调试）。
   */
  async recordReplanLineageAudit(
    tripId: string | null | undefined,
    audit: {
      requestId: string;
      tripRunId?: string;
      previous_plan_version?: number;
      previous_world_snapshot_hash?: string;
      new_plan_version?: number;
    },
  ): Promise<void> {
    const tid = typeof tripId === 'string' ? tripId.trim() : '';
    if (!tid) return;
    const hasPrev =
      audit.previous_plan_version !== undefined ||
      (typeof audit.previous_world_snapshot_hash === 'string' && audit.previous_world_snapshot_hash.trim());
    if (!hasPrev) return;

    try {
      const existing = await this.get(tid);
      const at = new Date().toISOString();
      const prevHistory = existing?.history ?? [];
      const payload: Record<string, unknown> = { requestId: audit.requestId };
      if (audit.tripRunId) payload.tripRunId = audit.tripRunId;
      if (audit.previous_plan_version !== undefined) payload.previous_plan_version = audit.previous_plan_version;
      const h = typeof audit.previous_world_snapshot_hash === 'string' ? audit.previous_world_snapshot_hash.trim() : '';
      if (h) payload.previous_world_snapshot_hash = h;
      if (audit.new_plan_version !== undefined) payload.new_plan_version = audit.new_plan_version;

      const history = [
        ...prevHistory,
        {
          at,
          event: 'replan_lineage',
          payload,
        },
      ].slice(-50);

      await this.update(tid, { history });
    } catch (e: any) {
      this.logger.warn(`recordReplanLineageAudit failed: ${e?.message}`);
    }
  }

  async updateFromWriteBack(
    tripId: string,
    data: {
      scratchpad?: { planOutline?: string; nextActions?: string[] };
      artifactsRefs?: Record<string, string>;
      phase?: TripTaskPhase;
      /** 与 Orchestrator / route_and_run 对齐的可选追溯字段 */
      requestId?: string;
      planVersion?: number;
    },
  ): Promise<void> {
    const artifactsRefs = data.artifactsRefs
      ? Object.values(data.artifactsRefs)
      : undefined;

    const decisionLogSummary = data.scratchpad?.planOutline
      ? data.scratchpad.planOutline.substring(0, 500)
      : undefined;

    const existing = await this.get(tripId);
    const at = new Date().toISOString();
    const prevHistory = existing?.history ?? [];
    const history = [
      ...prevHistory,
      {
        at,
        event: 'writeback',
        payload: {
          phase: data.phase,
          hasPlanOutline: Boolean(data.scratchpad?.planOutline),
          nextActionsCount: data.scratchpad?.nextActions?.length ?? 0,
          artifactCount: artifactsRefs?.length ?? 0,
          ...(data.requestId ? { requestId: data.requestId } : {}),
          ...(data.planVersion !== undefined ? { planVersion: data.planVersion } : {}),
        },
      },
    ].slice(-50);

    await this.update(tripId, {
      ...(data.phase && { currentPhase: data.phase }),
      ...(decisionLogSummary && { decisionLogSummary }),
      ...(artifactsRefs && artifactsRefs.length > 0 && { artifactsRefs }),
      history,
    });
  }

  /**
   * 追加 Recovery 审计行（按 trip 聚合；尾部截断防止 Redis 膨胀）。
   */
  async appendRecoveryAuditEntry(
    tripId: string | null | undefined,
    entry: Omit<TripTaskRecoveryAuditLine, 'at'> & { at?: string },
  ): Promise<void> {
    const tid = typeof tripId === 'string' ? tripId.trim() : '';
    if (!tid) return;
    try {
      const at = entry.at ?? new Date().toISOString();
      const row: TripTaskRecoveryAuditLine = { ...entry, at };
      const existing = await this.get(tid);
      const prev = existing?.recovery_audit_tail ?? [];
      const recovery_audit_tail = [...prev, row].slice(-80);
      await this.update(tid, { recovery_audit_tail });
    } catch (e: any) {
      this.logger.warn(`appendRecoveryAuditEntry failed: ${e?.message}`);
    }
  }

  /**
   * 按 failure_domain / is_retry 过滤审计尾（Decision Replay / Offline RL 样本抽取）。
   */
  filterRecoveryAuditTail(
    memory: TripTaskMemory | null | undefined,
    filter: { failure_domain?: string; is_retry?: boolean },
  ): TripTaskRecoveryAuditLine[] {
    const tail = memory?.recovery_audit_tail ?? [];
    return tail.filter((row) => {
      if (filter.failure_domain !== undefined && row.failure_domain !== filter.failure_domain) {
        return false;
      }
      if (filter.is_retry !== undefined && Boolean(row.is_retry) !== filter.is_retry) {
        return false;
      }
      return true;
    });
  }

  async delete(tripId: string): Promise<void> {
    const key = `${CACHE_PREFIX}${tripId}`;
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (e: any) {
        this.logger.warn(`Redis del 失败: ${e?.message}`);
      }
    }
    this.memoryFallback.delete(tripId);
  }
}
