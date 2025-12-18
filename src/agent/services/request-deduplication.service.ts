// src/agent/services/request-deduplication.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';

/**
 * 去重缓存项
 */
interface DedupCacheItem {
  requestHash: string;
  response: RouteAndRunResponseDto;
  timestamp: number;
  requestCount: number; // 相同请求的次数
}

/**
 * Request Deduplication Service
 * 
 * 请求去重服务：在短时间内检测并复用相同请求的处理结果
 * 
 * 特点：
 * - 基于请求内容的哈希值识别重复请求
 * - 短时间内（如 5 秒内）的相同请求复用结果
 * - 记录重复请求统计
 * - 内存缓存（可以扩展为 Redis 等外部存储）
 */
@Injectable()
export class RequestDeduplicationService {
  private readonly logger = new Logger(RequestDeduplicationService.name);
  
  // 去重缓存存储
  private readonly dedupCache: Map<string, DedupCacheItem> = new Map();
  
  // 默认 TTL：5 秒（短时间内）
  private readonly defaultTTL = 5 * 1000;
  
  // 最大缓存项数
  private readonly maxCacheSize = 500;

  /**
   * 生成请求哈希键
   * 
   * @param request 请求对象
   * @returns 请求哈希键
   */
  generateRequestHash(request: RouteAndRunRequestDto): string {
    // 生成去重键：基于关键字段（message, user_id, trip_id, options）
    // 注意：不包含 request_id，因为每次请求的 request_id 都不同
    const keyData = {
      message: request.message,
      user_id: request.user_id,
      trip_id: request.trip_id,
      // 只包含关键的 options，忽略时间相关的选项
      options: {
        dry_run: request.options?.dry_run,
        allow_webbrowse: request.options?.allow_webbrowse,
        // 不包含 max_seconds, max_steps 等可能影响结果的选项
      },
      // 包含最近的对话上下文（用于区分不同上下文）
      context: request.conversation_context?.recent_messages?.slice(-3) || [], // 只取最近 3 条消息
    };

    const keyStr = JSON.stringify(keyData, this.sortKeys);
    const hash = createHash('sha256').update(keyStr).digest('hex');
    
    return hash.substring(0, 32);
  }

  /**
   * 检查是否为重复请求
   * 
   * @param requestHash 请求哈希键
   * @returns 如果找到重复请求，返回缓存的响应；否则返回 null
   */
  checkDuplicate(requestHash: string): RouteAndRunResponseDto | null {
    const cached = this.dedupCache.get(requestHash);
    
    if (!cached) {
      return null;
    }

    // 检查是否过期
    const age = Date.now() - cached.timestamp;
    if (age > this.defaultTTL) {
      this.dedupCache.delete(requestHash);
      this.logger.debug(`Dedup cache expired for hash: ${requestHash.substring(0, 8)}...`);
      return null;
    }

    // 更新请求计数
    cached.requestCount++;
    this.logger.debug(
      `Duplicate request detected (hash: ${requestHash.substring(0, 8)}...), ` +
      `reusing result (count: ${cached.requestCount})`
    );

    // 返回缓存的响应，但需要更新 request_id 为当前请求的 ID
    // 注意：这里返回的是原始响应，调用者需要更新 request_id
    return cached.response;
  }

  /**
   * 缓存请求结果
   * 
   * @param requestHash 请求哈希键
   * @param response 响应对象
   */
  cacheResponse(
    requestHash: string,
    response: RouteAndRunResponseDto
  ): void {
    // 检查缓存大小限制
    if (this.dedupCache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    const cacheItem: DedupCacheItem = {
      requestHash,
      response: { ...response }, // 深拷贝，避免引用问题
      timestamp: Date.now(),
      requestCount: 1,
    };

    this.dedupCache.set(requestHash, cacheItem);
    this.logger.debug(`Cached response for deduplication (hash: ${requestHash.substring(0, 8)}...)`);
  }

  /**
   * 获取去重统计
   */
  getStats(): {
    cacheSize: number;
    totalRequests: number;
    dedupedRequests: number;
  } {
    let totalRequests = 0;
    let dedupedRequests = 0;

    for (const item of this.dedupCache.values()) {
      totalRequests += item.requestCount;
      if (item.requestCount > 1) {
        dedupedRequests += item.requestCount - 1;
      }
    }

    return {
      cacheSize: this.dedupCache.size,
      totalRequests,
      dedupedRequests,
    };
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.dedupCache.clear();
    this.logger.debug('Deduplication cache cleared');
  }

  /**
   * 清理过期缓存
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [hash, item] of this.dedupCache.entries()) {
      if (now - item.timestamp > this.defaultTTL) {
        this.dedupCache.delete(hash);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired deduplication cache entries`);
    }

    return cleanedCount;
  }

  /**
   * 逐出最旧的缓存项（LRU 策略）
   */
  private evictOldest(): void {
    if (this.dedupCache.size === 0) {
      return;
    }

    // 找到最旧的项
    let oldestHash: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [hash, item] of this.dedupCache.entries()) {
      if (item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp;
        oldestHash = hash;
      }
    }

    if (oldestHash) {
      this.dedupCache.delete(oldestHash);
      this.logger.debug(`Evicted oldest dedup cache entry: ${oldestHash.substring(0, 8)}...`);
    }
  }

  /**
   * 排序对象键（用于 JSON.stringify 时保持一致性）
   */
  private sortKeys(key: string, value: any): any {
    if (value instanceof Object && !Array.isArray(value)) {
      const sortedObj: Record<string, any> = {};
      Object.keys(value)
        .sort()
        .forEach(k => {
          sortedObj[k] = value[k];
        });
      return sortedObj;
    }
    return value;
  }
}

