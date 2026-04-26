// src/rag/services/redis-cache.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

/**
 * Redis 缓存服务
 *
 * 用于 RAG 架构的分布式缓存：
 * - McpToolsService 的 API 调用缓存
 * - WebBrowseSkill 的网页内容缓存
 * - RagFallbackService 的检索结果缓存
 *
 * 特性：
 * - 自动序列化/反序列化 JSON
 * - TTL 支持
 * - 连接池管理
 * - 优雅降级（Redis 不可用时返回 null）
 */
@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private client: RedisClientType | null = null;
  private isConnected = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化 Redis 客户端
   */
  private async initialize() {
    try {
      const disabled = String(process.env.DISABLE_REDIS ?? '').toLowerCase();
      if (disabled === '1' || disabled === 'true') {
        this.logger.warn('[Redis] DISABLE_REDIS enabled, using in-memory fallback');
        this.client = null;
        this.isConnected = false;
        return;
      }
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.logger.log(`[Redis] 连接到 Redis: ${redisUrl}`);

      this.client = createClient({
        url: redisUrl,
        // 连接选项
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              this.logger.error('[Redis] 重连次数过多，停止重连');
              return new Error('Redis reconnection failed');
            }
            // 指数退避：1s, 2s, 4s, 8s, ...
            const delay = Math.min(1000 * Math.pow(2, retries), 30000);
            this.logger.warn(`[Redis] 重连中... (第 ${retries} 次，延迟 ${delay}ms)`);
            return delay;
          },
        },
      });

      // 错误处理
      this.client.on('error', (err) => {
        this.logger.error('[Redis] 错误:', err.message);
        this.isConnected = false;
      });

      // 连接成功
      this.client.on('connect', () => {
        this.logger.log('[Redis] 连接成功');
        this.isConnected = true;
      });

      // 断开连接
      this.client.on('end', () => {
        this.logger.warn('[Redis] 连接断开');
        this.isConnected = false;
      });

      // 连接到 Redis
      await this.client.connect();
    } catch (error: any) {
      this.logger.error(`[Redis] 初始化失败: ${error.message}`);
      this.logger.warn('[Redis] 将使用内存缓存降级');
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * 获取缓存值
   *
   * @param key - 缓存键
   * @returns 缓存值（如果存在且未过期）
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value as string) as T;
    } catch (error: any) {
      this.logger.error(`[Redis] 获取缓存失败: ${key}`, error.message);
      return null;
    }
  }

  /**
   * 设置缓存值
   *
   * @param key - 缓存键
   * @param value - 缓存值
   * @param ttlSeconds - 过期时间（秒），默认 3600 秒（1 小时）
   */
  async set<T>(key: string, value: T, ttlSeconds = 3600): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      this.logger.warn(`[Redis] Redis 不可用，跳过缓存: ${key}`);
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      await this.client.setEx(key, ttlSeconds, serialized);
      return true;
    } catch (error: any) {
      this.logger.error(`[Redis] 设置缓存失败: ${key}`, error.message);
      return false;
    }
  }

  /**
   * 删除缓存值
   *
   * @param key - 缓存键
   */
  async del(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error: any) {
      this.logger.error(`[Redis] 删除缓存失败: ${key}`, error.message);
      return false;
    }
  }

  /**
   * 批量删除缓存（使用 pattern）
   *
   * @param pattern - 键模式（例如 "weather:*"）
   */
  async delPattern(pattern: string): Promise<number> {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);
      return keys.length;
    } catch (error: any) {
      this.logger.error(`[Redis] 批量删除缓存失败: ${pattern}`, error.message);
      return 0;
    }
  }

  /**
   * 检查缓存是否存在
   *
   * @param key - 缓存键
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (error: any) {
      this.logger.error(`[Redis] 检查缓存存在性失败: ${key}`, error.message);
      return false;
    }
  }

  /**
   * 获取缓存剩余 TTL
   *
   * @param key - 缓存键
   * @returns 剩余秒数（-2 表示不存在，-1 表示无过期时间）
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected || !this.client) {
      return -2;
    }

    try {
      return await this.client.ttl(key);
    } catch (error: any) {
      this.logger.error(`[Redis] 获取 TTL 失败: ${key}`, error.message);
      return -2;
    }
  }

  /**
   * 增加计数器
   *
   * @param key - 计数器键
   * @param increment - 增量（默认 1）
   * @returns 增加后的值
   */
  async incr(key: string, increment = 1): Promise<number> {
    if (!this.isConnected || !this.client) {
      return 0;
    }

    try {
      return await this.client.incrBy(key, increment);
    } catch (error: any) {
      this.logger.error(`[Redis] 增加计数器失败: ${key}`, error.message);
      return 0;
    }
  }

  /**
   * 设置计数器过期时间
   *
   * @param key - 计数器键
   * @param ttlSeconds - 过期时间（秒）
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.expire(key, ttlSeconds);
      return true;
    } catch (error: any) {
      this.logger.error(`[Redis] 设置过期时间失败: ${key}`, error.message);
      return false;
    }
  }

  /**
   * 清空所有缓存（危险操作，仅用于测试）
   */
  async flushAll(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      await this.client.flushAll();
      this.logger.warn('[Redis] 已清空所有缓存');
      return true;
    } catch (error: any) {
      this.logger.error('[Redis] 清空缓存失败', error.message);
      return false;
    }
  }

  /**
   * 获取 Redis 连接状态
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Ping Redis 服务器
   */
  async ping(): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error: any) {
      this.logger.error('[Redis] Ping 失败', error.message);
      return false;
    }
  }

  /**
   * 获取 Redis 信息
   */
  async info(): Promise<string | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      return await this.client.info();
    } catch (error: any) {
      this.logger.error('[Redis] 获取信息失败', error.message);
      return null;
    }
  }

  /**
   * 模块销毁时断开连接
   */
  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('[Redis] 连接已关闭');
      } catch (error: any) {
        this.logger.error('[Redis] 关闭连接失败', error.message);
      }
    }
  }
}
