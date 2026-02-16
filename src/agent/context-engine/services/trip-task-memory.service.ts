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
import type { TripTaskMemory, TripTaskPhase } from '../interfaces/trip-task-memory.interface';

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
    delta: Partial<Pick<TripTaskMemory, 'currentPhase' | 'selectedRouteDirectionId' | 'decisionLogSummary' | 'artifactsRefs'>>,
  ): Promise<void> {
    const existing = await this.get(tripId);
    const merged: TripTaskMemory = {
      tripId,
      currentPhase: existing?.currentPhase ?? 'intake',
      decisionLogSummary: existing?.decisionLogSummary ?? '',
      artifactsRefs: existing?.artifactsRefs ?? [],
      lastUpdated: new Date().toISOString(),
      ...delta,
    };
    await this.set(merged);
  }

  /**
   * 从 writeBack 数据更新任务记忆（供 ContextEngineerService 调用）
   */
  async updateFromWriteBack(
    tripId: string,
    data: {
      scratchpad?: { planOutline?: string; nextActions?: string[] };
      artifactsRefs?: Record<string, string>;
      phase?: TripTaskPhase;
    },
  ): Promise<void> {
    const artifactsRefs = data.artifactsRefs
      ? Object.values(data.artifactsRefs)
      : undefined;

    const decisionLogSummary = data.scratchpad?.planOutline
      ? data.scratchpad.planOutline.substring(0, 500)
      : undefined;

    await this.update(tripId, {
      ...(data.phase && { currentPhase: data.phase }),
      ...(decisionLogSummary && { decisionLogSummary }),
      ...(artifactsRefs && artifactsRefs.length > 0 && { artifactsRefs }),
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
