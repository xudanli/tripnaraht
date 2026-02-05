// src/data-quality/services/dem-resolution-cache.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * DEM分辨率缓存服务
 * 
 * 功能：
 * - 缓存DEM分辨率计算结果，避免每次查询数据库
 * - TTL: 1小时（分辨率变化频率低，只在数据导入时变化）
 * - 支持多个DEM表的分辨率缓存
 * 
 * 缓存策略：
 * - 内存缓存（简单高效）
 * - 缓存键: `dem:resolution:{tableName}`
 * - TTL: 3600000ms (1小时)
 */
@Injectable()
export class DEMResolutionCacheService {
  private readonly logger = new Logger(DEMResolutionCacheService.name);

  // 内存缓存
  private readonly cache = new Map<string, { resolution: string; timestamp: number }>();

  // TTL: 1小时（3600000ms）
  private readonly TTL_MS = 3600000;

  /**
   * 获取DEM分辨率（带缓存）
   * 
   * @param tableName DEM表名（'geo_dem_cities_merged' | 'geo_dem_global'）
   * @param calculateFn 计算函数（如果缓存未命中时调用）
   * @returns 分辨率字符串，如 '30m', '90m', '300m'
   */
  async getResolution(
    tableName: string,
    calculateFn: () => Promise<string>
  ): Promise<string> {
    const cacheKey = `dem:resolution:${tableName}`;
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.TTL_MS) {
      this.logger.debug(`[DEMResolutionCache] Cache hit: ${tableName} -> ${cached.resolution}`);
      return cached.resolution;
    }

    // 缓存未命中，计算并缓存
    this.logger.debug(`[DEMResolutionCache] Cache miss: ${tableName}, calculating...`);
    const resolution = await calculateFn();
    
    // 缓存结果
    this.cache.set(cacheKey, {
      resolution,
      timestamp: Date.now(),
    });

    this.logger.log(`[DEMResolutionCache] Cached resolution: ${tableName} -> ${resolution}`);
    return resolution;
  }

  /**
   * 清除缓存（用于数据更新后）
   * 
   * @param tableName DEM表名（可选，如果不提供则清除所有缓存）
   */
  clearCache(tableName?: string): void {
    if (tableName) {
      const cacheKey = `dem:resolution:${tableName}`;
      this.cache.delete(cacheKey);
      this.logger.log(`[DEMResolutionCache] Cleared cache for: ${tableName}`);
    } else {
      this.cache.clear();
      this.logger.log('[DEMResolutionCache] Cleared all cache');
    }
  }

  /**
   * 获取缓存统计信息（用于监控）
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ tableName: string; resolution: string; ageMs: number }>;
  } {
    const entries: Array<{ tableName: string; resolution: string; ageMs: number }> = [];
    
    for (const [key, value] of this.cache.entries()) {
      const tableName = key.replace('dem:resolution:', '');
      entries.push({
        tableName,
        resolution: value.resolution,
        ageMs: Date.now() - value.timestamp,
      });
    }

    return {
      size: this.cache.size,
      entries,
    };
  }
}
