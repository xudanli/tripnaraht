// src/transport/services/route-cache.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 路线缓存服务
 * 
 * 功能：
 * 1. 缓存热门路线（如"成田机场 → 新宿站"），避免重复调用 API
 * 2. 短距离（< 1km）使用 PostGIS 直接计算，不调 API
 * 3. 缓存有效期：24 小时
 */
@Injectable()
export class RouteCacheService {
  private readonly logger = new Logger(RouteCacheService.name);
  private readonly cacheExpiryHours = 24;

  constructor(private prisma: PrismaService) {}

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
   * 从缓存获取路线（未来可以扩展为数据库缓存表）
   * 
   * 目前返回 null，表示未实现数据库缓存
   * 可以后续添加 RouteCache 表来存储热门路线
   */
  async getCachedRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: string
  ): Promise<any | null> {
    // TODO: 实现数据库缓存
    // 可以创建一个 RouteCache 表：
    // - cacheKey (string, unique)
    // - routeData (JSONB)
    // - expiresAt (DateTime)
    // 
    // 查询逻辑：
    // const cached = await this.prisma.routeCache.findUnique({
    //   where: { cacheKey: this.generateCacheKey(...) },
    // });
    // if (cached && cached.expiresAt > new Date()) {
    //   return cached.routeData;
    // }
    
    return null;
  }

  /**
   * 保存路线到缓存（未来可以扩展为数据库缓存表）
   */
  async saveCachedRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: string,
    routeData: any
  ): Promise<void> {
    // TODO: 实现数据库缓存
    // await this.prisma.routeCache.upsert({
    //   where: { cacheKey: this.generateCacheKey(...) },
    //   create: {
    //     cacheKey: this.generateCacheKey(...),
    //     routeData: routeData,
    //     expiresAt: new Date(Date.now() + this.cacheExpiryHours * 60 * 60 * 1000),
    //   },
    //   update: {
    //     routeData: routeData,
    //     expiresAt: new Date(Date.now() + this.cacheExpiryHours * 60 * 60 * 1000),
    //   },
    // });
  }
}

