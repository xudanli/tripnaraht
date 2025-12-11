// src/transport/services/route-cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * 路线缓存服务
 * 
 * 功能：
 * 1. 使用 Redis 缓存热门路线（如"成田机场 → 新宿站"），避免重复调用 API
 * 2. 短距离（< 1km）使用 PostGIS 直接计算，不调 API
 * 3. 缓存有效期：24 小时
 */
@Injectable()
export class RouteCacheService {
  private readonly logger = new Logger(RouteCacheService.name);
  private readonly cacheExpiryHours = 24;
  private readonly cachePrefix = 'route';

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService
  ) {}

  /**
   * 检查是否为短距离（使用 PostGIS 计算，不调 API）
   * 
   * @param distanceMeters 距离（米）
   * @returns 是否为短距离
   */
  isShortDistance(distanceMeters: number): boolean {
    return distanceMeters < 1000; // < 1km
  }

  /**
   * 计算短距离的步行时间（使用 PostGIS）
   * 
   * @param fromLat 起点纬度
   * @param fromLng 起点经度
   * @param toLat 终点纬度
   * @param toLng 终点经度
   * @returns 步行时间（分钟）
   */
  async calculateShortDistanceWalkTime(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): Promise<number> {
    try {
      // 使用 PostGIS 计算距离
      const result = await this.prisma.$queryRaw<Array<{ distance_meters: number }>>`
        SELECT 
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${fromLng}, ${fromLat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${toLng}, ${toLat}), 4326)::geography
          ) as distance_meters
      `;

      const distanceMeters = result[0]?.distance_meters || 0;
      
      // 步行速度：80 米/分钟
      return Math.round(distanceMeters / 80);
    } catch (error) {
      this.logger.error('PostGIS 距离计算失败', error);
      // 降级：使用 Haversine 公式
      return this.fallbackCalculateWalkTime(fromLat, fromLng, toLat, toLng);
    }
  }

  /**
   * 降级计算：使用 Haversine 公式
   */
  private fallbackCalculateWalkTime(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRadians(toLat - fromLat);
    const dLng = this.toRadians(toLng - fromLng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(fromLat)) *
        Math.cos(this.toRadians(toLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceMeters = R * c;

    // 步行速度：80 米/分钟
    return Math.round(distanceMeters / 80);
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: string
  ): string {
    // 将坐标四舍五入到小数点后 4 位（约 11 米精度），减少缓存键数量
    const roundedFromLat = Math.round(fromLat * 10000) / 10000;
    const roundedFromLng = Math.round(fromLng * 10000) / 10000;
    const roundedToLat = Math.round(toLat * 10000) / 10000;
    const roundedToLng = Math.round(toLng * 10000) / 10000;

    return `${roundedFromLat},${roundedFromLng}_${roundedToLat},${roundedToLng}_${travelMode}`;
  }

  /**
   * 从 Redis 缓存获取路线
   */
  async getCachedRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: string
  ): Promise<any | null> {
    try {
      const cacheKey = this.generateCacheKey(fromLat, fromLng, toLat, toLng, travelMode);
      const redisKey = this.redisService.generateKey(this.cachePrefix, cacheKey);
      
      const cached = await this.redisService.get<any>(redisKey);
      
      if (cached) {
        this.logger.debug(`缓存命中: ${redisKey}`);
        return cached;
      }
      
      return null;
    } catch (error) {
      this.logger.error('从 Redis 获取缓存失败', error);
      return null;
    }
  }

  /**
   * 保存路线到 Redis 缓存
   */
  async saveCachedRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: string,
    routeData: any
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(fromLat, fromLng, toLat, toLng, travelMode);
      const redisKey = this.redisService.generateKey(this.cachePrefix, cacheKey);
      
      // TTL: 24 小时（秒）
      const ttl = this.cacheExpiryHours * 60 * 60;
      
      await this.redisService.set(redisKey, routeData, ttl);
      this.logger.debug(`缓存已保存: ${redisKey}, TTL: ${ttl}秒`);
    } catch (error) {
      this.logger.error('保存到 Redis 缓存失败', error);
      // 不抛出错误，允许系统继续运行
    }
  }
}

