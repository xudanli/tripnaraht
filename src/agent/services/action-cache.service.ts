// src/agent/services/action-cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Action 缓存项
 */
interface CacheItem {
  key: string;
  value: any;
  timestamp: number;
  ttl?: number; // Time to live in milliseconds
}

/**
 * Action Cache Service
 * 
 * 用于缓存 Action 的执行结果，提高性能
 * 
 * 特点：
 * - 支持基于 cacheable 元数据的自动缓存
 * - 支持自定义缓存键（cache_key）
 * - 支持 TTL（Time To Live）
 * - 内存缓存（可以扩展为 Redis 等外部缓存）
 */
@Injectable()
export class ActionCacheService {
  private readonly logger = new Logger(ActionCacheService.name);
  
  // 内存缓存存储
  private readonly cache: Map<string, CacheItem> = new Map();
  
  // 默认 TTL：5 分钟
  private readonly defaultTTL = 5 * 60 * 1000;
  
  // 最大缓存项数（防止内存溢出）
  private readonly maxCacheSize = 1000;

  /**
   * 生成缓存键
   * 
   * @param actionName Action 名称
   * @param input Action 输入参数
   * @param customKey 自定义缓存键（来自 metadata.cache_key）
   * @returns 缓存键
   */
  generateCacheKey(
    actionName: string,
    input: any,
    customKey?: string
  ): string {
    if (customKey) {
      // 使用自定义缓存键（需要处理占位符，如 {trip_id}）
      return this.processCustomCacheKey(customKey, input);
    }

    // 默认：基于 actionName + 归一化的 input 生成哈希
    // 关键：只使用稳定的参数，排除 state 等不稳定的对象
    const normalizedInput = this.normalizeInput(input);
    const inputStr = this.stableStringify(normalizedInput);
    const hash = createHash('sha256')
      .update(`${actionName}:${inputStr}`)
      .digest('hex');
    
    return `${actionName}:${hash.substring(0, 16)}`;
  }

  /**
   * 归一化输入参数（只保留会影响结果的稳定字段）
   * 排除 state、request_id 等不稳定的对象
   */
  private normalizeInput(input: any): any {
    if (!input || typeof input !== 'object') {
      return input;
    }

    // 对于 places.resolve_entities，只保留 query, lat, lng, limit
    // 对于其他 action，保留所有原始字段（但排除 state）
    const normalized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(input)) {
      // 排除不稳定的字段
      if (key === 'state' || key === 'request_id' || key === 'timestamp') {
        continue;
      }
      
      // 递归处理嵌套对象
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        normalized[key] = this.normalizeInput(value);
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }

  /**
   * 稳定序列化（确保键顺序固定）
   */
  private stableStringify(obj: any): string {
    if (obj === null || obj === undefined) {
      return String(obj);
    }
    
    if (typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.stableStringify(item)).join(',') + ']';
    }
    
    // 对象：按键排序后序列化
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map(key => {
      return JSON.stringify(key) + ':' + this.stableStringify(obj[key]);
    });
    
    return '{' + pairs.join(',') + '}';
  }

  /**
   * 处理自定义缓存键（支持占位符）
   * 
   * 例如：{trip_id} -> 替换为实际的 trip_id 值
   */
  private processCustomCacheKey(customKey: string, input: any): string {
    let processedKey = customKey;
    
    // 替换占位符 {key} -> input[key]
    const placeholderRegex = /\{(\w+)\}/g;
    processedKey = processedKey.replace(placeholderRegex, (match, key) => {
      return input[key] !== undefined ? String(input[key]) : match;
    });
    
    return processedKey;
  }

  /**
   * 获取缓存值
   */
  get(key: string): any | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // 检查是否过期
    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    this.logger.debug(`Cache hit for key: ${key}`);
    return item.value;
  }

  /**
   * 设置缓存值
   */
  set(
    key: string,
    value: any,
    ttl?: number
  ): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxCacheSize) {
      this.evictOldest();
    }

    const item: CacheItem = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    };

    this.cache.set(key, item);
    this.logger.debug(`Cache set for key: ${key}, TTL: ${item.ttl}ms`);
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.logger.debug(`Cache deleted for key: ${key}`);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    this.logger.debug('Cache cleared');
  }

  /**
   * 删除匹配模式的缓存键（支持前缀匹配）
   * 
   * 例如：deleteByPattern('trip.load_draft:') 会删除所有以该前缀开头的缓存
   */
  deleteByPattern(pattern: string): void {
    let deletedCount = 0;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.logger.debug(`Deleted ${deletedCount} cache entries matching pattern: ${pattern}`);
    }
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate?: number; // 需要额外的命中率追踪
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }

  /**
   * 逐出最旧的缓存项（LRU 策略）
   */
  private evictOldest(): void {
    if (this.cache.size === 0) {
      return;
    }

    // 找到最旧的项
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }
  }


  /**
   * 清理过期缓存
   */
  cleanupExpired(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.ttl && now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }
}

