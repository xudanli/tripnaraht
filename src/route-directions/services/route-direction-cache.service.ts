// src/route-directions/services/route-direction-cache.service.ts
/**
 * RouteDirection 缓存服务
 * 
 * 实现两级缓存：
 * 1. RD selection cache：key = country+month+intent+pace+persona，TTL 1–6h
 * 2. POI pool cache：key = routeDirectionId+bufferMeters+signaturePoisHash，TTL 6–24h
 * 
 * 验收：重复请求同 RD 的 p95 延迟下降明显；数据库不出现慢查询尖峰
 */

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RouteDirectionRecommendation, UserIntent } from './route-direction-selector.service';
import { ActivityCandidate } from '../../trips/decision/world-model';
import * as crypto from 'crypto';

@Injectable()
export class RouteDirectionCacheService {
  private readonly logger = new Logger(RouteDirectionCacheService.name);
  
  // 缓存前缀
  private readonly RD_SELECTION_CACHE_PREFIX = 'rd:selection';
  private readonly POI_POOL_CACHE_PREFIX = 'rd:poi-pool';
  
  // 默认 TTL（秒）
  private readonly RD_SELECTION_TTL_MIN = 3600; // 1 小时
  private readonly RD_SELECTION_TTL_MAX = 21600; // 6 小时
  private readonly POI_POOL_TTL_MIN = 21600; // 6 小时
  private readonly POI_POOL_TTL_MAX = 86400; // 24 小时

  constructor(private readonly redisService: RedisService) {}

  /**
   * 生成 RD selection 缓存键
   * key = country+month+intent+pace+persona
   */
  private generateRdSelectionCacheKey(
    countryCode: string,
    month: number | undefined,
    userIntent: UserIntent
  ): string {
    // 构建意图签名
    const intentParts = [
      countryCode,
      month?.toString() || 'any',
      (userIntent.preferences || []).sort().join(','),
      userIntent.pace || 'any',
      userIntent.riskTolerance || 'any',
      userIntent.durationDays?.toString() || 'any',
    ];
    
    // 生成哈希（缩短键长度）
    const intentHash = crypto
      .createHash('md5')
      .update(intentParts.join('|'))
      .digest('hex')
      .substring(0, 16);
    
    return this.redisService.generateKey(
      this.RD_SELECTION_CACHE_PREFIX,
      countryCode,
      month || 'any',
      intentHash
    );
  }

  /**
   * 获取缓存的 RD selection 结果
   */
  async getCachedRdSelection(
    countryCode: string,
    month: number | undefined,
    userIntent: UserIntent
  ): Promise<RouteDirectionRecommendation[] | null> {
    try {
      const cacheKey = this.generateRdSelectionCacheKey(countryCode, month, userIntent);
      const cached = await this.redisService.get<RouteDirectionRecommendation[]>(cacheKey);
      
      if (cached) {
        this.logger.debug(`RD selection cache hit: ${cacheKey}`);
        return cached;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached RD selection', error);
      return null;
    }
  }

  /**
   * 缓存 RD selection 结果
   * TTL: 1-6 小时（根据月份和意图的稳定性动态调整）
   */
  async cacheRdSelection(
    countryCode: string,
    month: number | undefined,
    userIntent: UserIntent,
    recommendations: RouteDirectionRecommendation[]
  ): Promise<void> {
    try {
      const cacheKey = this.generateRdSelectionCacheKey(countryCode, month, userIntent);
      
      // 动态 TTL：月份明确时用较长 TTL，否则用较短 TTL
      const ttl = month
        ? this.RD_SELECTION_TTL_MAX // 6 小时（月份明确，更稳定）
        : this.RD_SELECTION_TTL_MIN; // 1 小时（月份不明确，可能变化）
      
      await this.redisService.set(cacheKey, recommendations, ttl);
      this.logger.debug(`RD selection cached: ${cacheKey}, TTL: ${ttl}s`);
    } catch (error) {
      this.logger.error('Failed to cache RD selection', error);
      // 不抛出错误，允许系统继续运行
    }
  }

  /**
   * 生成 POI pool 缓存键
   * key = routeDirectionId+bufferMeters+signaturePoisHash
   */
  private generatePoiPoolCacheKey(
    routeDirectionId: number,
    bufferMeters: number,
    signaturePois?: any
  ): string {
    // 生成 signaturePois 的哈希
    let signaturePoisHash = 'none';
    if (signaturePois) {
      const signatureStr = JSON.stringify(signaturePois);
      signaturePoisHash = crypto
        .createHash('md5')
        .update(signatureStr)
        .digest('hex')
        .substring(0, 16);
    }
    
    return this.redisService.generateKey(
      this.POI_POOL_CACHE_PREFIX,
      routeDirectionId,
      bufferMeters,
      signaturePoisHash
    );
  }

  /**
   * 获取缓存的 POI pool
   */
  async getCachedPoiPool(
    routeDirectionId: number,
    bufferMeters: number,
    signaturePois?: any
  ): Promise<ActivityCandidate[] | null> {
    try {
      const cacheKey = this.generatePoiPoolCacheKey(routeDirectionId, bufferMeters, signaturePois);
      const cached = await this.redisService.get<ActivityCandidate[]>(cacheKey);
      
      if (cached) {
        this.logger.debug(`POI pool cache hit: ${cacheKey}`);
        return cached;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get cached POI pool', error);
      return null;
    }
  }

  /**
   * 缓存 POI pool
   * TTL: 6-24 小时（根据 signaturePois 的稳定性动态调整）
   */
  async cachePoiPool(
    routeDirectionId: number,
    bufferMeters: number,
    pois: ActivityCandidate[],
    signaturePois?: any
  ): Promise<void> {
    try {
      const cacheKey = this.generatePoiPoolCacheKey(routeDirectionId, bufferMeters, signaturePois);
      
      // 动态 TTL：如果有 signaturePois，说明更稳定，用较长 TTL
      const ttl = signaturePois
        ? this.POI_POOL_TTL_MAX // 24 小时（有 signaturePois，更稳定）
        : this.POI_POOL_TTL_MIN; // 6 小时（无 signaturePois，可能变化）
      
      await this.redisService.set(cacheKey, pois, ttl);
      this.logger.debug(`POI pool cached: ${cacheKey}, TTL: ${ttl}s, size: ${pois.length}`);
    } catch (error) {
      this.logger.error('Failed to cache POI pool', error);
      // 不抛出错误，允许系统继续运行
    }
  }

  /**
   * 使 RD selection 缓存失效
   */
  async invalidateRdSelectionCache(
    countryCode: string,
    month?: number
  ): Promise<void> {
    try {
      // 由于使用了哈希，我们需要删除所有匹配的键
      // 这里简化实现：只删除特定月份的缓存
      // 生产环境可以使用 Redis SCAN 来查找匹配的键
      this.logger.warn('RD selection cache invalidation requires Redis SCAN, not implemented yet');
    } catch (error) {
      this.logger.error('Failed to invalidate RD selection cache', error);
    }
  }

  /**
   * 使 POI pool 缓存失效
   */
  async invalidatePoiPoolCache(routeDirectionId: number): Promise<void> {
    try {
      // 由于使用了哈希，我们需要删除所有匹配的键
      // 这里简化实现：只记录警告
      // 生产环境可以使用 Redis SCAN 来查找匹配的键
      this.logger.warn(`POI pool cache invalidation for RD ${routeDirectionId} requires Redis SCAN, not implemented yet`);
    } catch (error) {
      this.logger.error('Failed to invalidate POI pool cache', error);
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats(): Promise<{
    rdSelectionCacheKeys: number;
    poiPoolCacheKeys: number;
  }> {
    // 简化实现：返回占位符
    // 生产环境可以使用 Redis INFO 或 SCAN 来获取实际统计
    return {
      rdSelectionCacheKeys: 0,
      poiPoolCacheKeys: 0,
    };
  }
}

