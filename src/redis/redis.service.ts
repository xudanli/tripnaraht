// src/redis/redis.service.ts
import { Injectable, Inject, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Redis 服务
 * 
 * 提供统一的缓存操作接口
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cacheManager.get<T>(key);
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
      await this.cacheManager.set(key, value, ttl);
    } catch (error) {
      this.logger.error(`Redis SET 失败: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
    } catch (error) {
      this.logger.error(`Redis DEL 失败: ${key}`, error);
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.cacheManager.get(key);
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
      // cache-manager 没有 reset 方法，这里记录警告
      this.logger.warn('Cache reset 功能需要直接操作 Redis，当前版本暂不支持');
      // 如果需要实现，可以使用 redis 客户端直接调用 FLUSHDB
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
