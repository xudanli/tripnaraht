// src/agent/assistants/planning-assistant/services/pa-conversation-context.service.ts
/**
 * PA 多轮对话上下文（Redis + 内存双写，对齐 NLConversationContextService）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../../redis/redis.service';
import type { PlanningConversationState } from '../interfaces/planning-assistant.interface';

const CACHE_PREFIX = 'pa_conversation:';
/** 24 小时（秒），与 PA 会话 TTL 一致 */
const DEFAULT_TTL_SEC = 24 * 60 * 60;

@Injectable()
export class PaConversationContextService {
  private readonly logger = new Logger(PaConversationContextService.name);
  private readonly memoryCache = new Map<string, { state: PlanningConversationState; expires: number }>();

  constructor(@Optional() private readonly redisService?: RedisService) {
    if (this.redisService) {
      this.logger.log('PA 对话上下文已启用（Redis + 内存，TTL 24h）');
    } else {
      this.logger.warn('PA 对话上下文仅内存（Redis 未注入，多 Pod / 重启会失忆）');
    }
  }

  private buildCacheKey(sessionId: string): string {
    return `${CACHE_PREFIX}${sessionId}`;
  }

  async get(sessionId: string, userId?: string): Promise<PlanningConversationState | null> {
    const cacheKey = this.buildCacheKey(sessionId);

    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && memoryEntry.expires > Date.now()) {
      return this.assertOwnership(memoryEntry.state, sessionId, userId);
    }

    if (this.redisService) {
      try {
        const fromRedis = await this.redisService.get<PlanningConversationState>(cacheKey);
        if (fromRedis) {
          this.memoryCache.set(cacheKey, {
            state: fromRedis,
            expires: Date.parse(fromRedis.expiresAt) || Date.now() + DEFAULT_TTL_SEC * 1000,
          });
          return this.assertOwnership(fromRedis, sessionId, userId);
        }
      } catch (error: any) {
        this.logger.warn(`从 Redis 读取 PA 会话失败: ${error?.message ?? error}`);
      }
    }

    return null;
  }

  async set(state: PlanningConversationState): Promise<void> {
    const cacheKey = this.buildCacheKey(state.sessionId);
    const updated: PlanningConversationState = {
      ...state,
      updatedAt: new Date().toISOString(),
    };

    if (this.redisService) {
      try {
        await this.redisService.set(cacheKey, updated, DEFAULT_TTL_SEC);
      } catch (error: any) {
        this.logger.warn(`保存 PA 会话到 Redis 失败: ${error?.message ?? error}`);
      }
    }

    const expiresMs = Date.parse(updated.expiresAt) || Date.now() + DEFAULT_TTL_SEC * 1000;
    this.memoryCache.set(cacheKey, { state: updated, expires: expiresMs });
    this.cleanExpiredMemoryCache();
  }

  async delete(sessionId: string): Promise<void> {
    const cacheKey = this.buildCacheKey(sessionId);
    this.memoryCache.delete(cacheKey);
    if (this.redisService) {
      try {
        await this.redisService.del(cacheKey);
      } catch (error: any) {
        this.logger.warn(`删除 PA 会话 Redis 键失败: ${error?.message ?? error}`);
      }
    }
  }

  private assertOwnership(
    state: PlanningConversationState,
    sessionId: string,
    userId?: string,
  ): PlanningConversationState | null {
    if (state.sessionId !== sessionId) {
      return null;
    }
    if (userId && state.userId && state.userId !== userId) {
      this.logger.warn(`用户 ${userId} 无权访问会话 ${sessionId}`);
      return null;
    }
    if (new Date(state.expiresAt) < new Date()) {
      return null;
    }
    return state;
  }

  private cleanExpiredMemoryCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expires <= now) {
        this.memoryCache.delete(key);
      }
    }
  }
}
