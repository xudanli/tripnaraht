// src/redis/redis.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/** Redis 不可达时 cache-manager 可能永久挂起；所有读写加硬超时并 fail-open。 */
const REDIS_OP_TIMEOUT_MS = (() => {
  const n = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 2500);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), 200), 15_000) : 2500;
})();

function withRedisTimeout<T>(op: Promise<T>, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), REDIS_OP_TIMEOUT_MS);
  });
  return Promise.race([op, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Redis 服务
 *
 * 提供统一的缓存操作接口
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private timedOutOnce = false;

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  private noteTimeout(op: string, key: string): void {
    if (!this.timedOutOnce) {
      this.timedOutOnce = true;
      this.logger.warn(
        `Redis ${op} 超时 ${REDIS_OP_TIMEOUT_MS}ms（key=${key}）；后续同类操作将 fail-open。检查 REDIS_* / DISABLE_REDIS`,
      );
    }
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await withRedisTimeout(this.cacheManager.get<T>(key), () => {
        this.noteTimeout('GET', key);
        return undefined;
      });
    } catch (error) {
      this.logger.error(`Redis GET 失败: ${key}`, error);
      return undefined;
    }
  }

  /**
   * 设置缓存值
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await withRedisTimeout(this.cacheManager.set(key, value, ttl), () => {
        this.noteTimeout('SET', key);
        return undefined as void;
      });
    } catch (error) {
      this.logger.error(`Redis SET 失败: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    try {
      await withRedisTimeout(this.cacheManager.del(key), () => {
        this.noteTimeout('DEL', key);
        return false;
      });
    } catch (error) {
      this.logger.error(`Redis DEL 失败: ${key}`, error);
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.get(key);
      return value !== undefined && value !== null;
    } catch (error) {
      this.logger.error(`Redis EXISTS 失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 清空所有缓存
   *
   * 注意: cache-manager 的 Cache 接口没有 reset 方法
   * 如果需要清空所有缓存，需要直接操作 Redis
   */
  async reset(): Promise<void> {
    try {
      this.logger.warn('Cache reset 功能需要直接操作 Redis，当前版本暂不支持');
    } catch (error) {
      this.logger.error('Redis RESET 失败', error);
    }
  }

  /**
   * 生成缓存键
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }
}
