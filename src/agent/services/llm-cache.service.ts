/**
 * LLM缓存服务
 * 基于参数指纹缓存LLM结果，避免重复调用
 */

import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

interface CacheEntry<T> {
  result: T;
  timestamp: number;
  ttl: number;
}

@Injectable()
export class LLMCacheService {
  private readonly logger = new Logger(LLMCacheService.name);
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 3600000; // 1小时

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    this.logger.debug(`Cache hit: ${key}`);
    return entry.result;
  }

  /**
   * 设置缓存
   */
  async set<T>(key: string, result: T, ttl: number = this.DEFAULT_TTL): Promise<void> {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl,
    });
    this.logger.debug(`Cache set: ${key}, TTL: ${ttl}ms`);
  }

  /**
   * 生成缓存键
   * 基于provider、prompt、schema生成指纹
   */
  generateKey(
    provider: LlmProvider,
    prompt: string,
    schema: any,
  ): string {
    // 简化版：使用prompt的前500字符 + schema的JSON字符串
    const promptHash = this.hashString(prompt.substring(0, 500));
    const schemaHash = this.hashString(JSON.stringify(schema));
    return `${provider}_${promptHash}_${schemaHash}`;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.logger.log('Cache cleared');
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 简单的字符串哈希
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}
