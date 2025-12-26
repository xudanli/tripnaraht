// src/route-directions/services/route-direction-poi-generator.service.ts
/**
 * RouteDirection POI 生成器服务
 * 
 * 根据选中的路线方向生成候选 POI pool
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { ActivityCandidate } from '../../trips/decision/world-model';
import { RouteDirectionRecommendation } from './route-direction-selector.service';
import { RouteDirectionCacheService } from './route-direction-cache.service';

@Injectable()
export class RouteDirectionPoiGeneratorService {
  private readonly logger = new Logger(RouteDirectionPoiGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cacheService?: RouteDirectionCacheService
  ) {}

  /**
   * 根据路线方向生成候选 POI（带走廊空间约束）
   * 
   * @param recommendation 选中的路线方向推荐
   * @param regions 区域列表（可选，用于进一步筛选）
   * @param bufferMeters 走廊缓冲区（米），默认 50000（50km）
   * @returns 候选 POI 列表
   */
  async generateCandidatePois(
    recommendation: RouteDirectionRecommendation,
    regions?: string[],
    bufferMeters: number = 50000
  ): Promise<ActivityCandidate[]> {
    this.logger.log(
      `为路线方向生成候选 POI: ${recommendation.routeDirection.name}, buffer=${bufferMeters}m`
    );

    // 尝试从缓存获取
    if (this.cacheService) {
      const cached = await this.cacheService.getCachedPoiPool(
        recommendation.routeDirection.id,
        bufferMeters,
        recommendation.signaturePois
      );
      if (cached) {
        this.logger.log(`使用缓存的 POI pool，大小: ${cached.length}`);
        return cached;
      }
    }

    const signaturePois = recommendation.signaturePois;
    if (!signaturePois) {
      this.logger.warn('路线方向没有 signaturePois，返回空列表');
      return [];
    }

    const poiTypes = signaturePois.types || [];
    const exampleUuids = signaturePois.examples || [];
    const corridorGeom = recommendation.routeDirection.corridorGeom;

    const candidates: ActivityCandidate[] = [];

    // 1. 如果有示例 UUID，直接查询这些 POI（不受走廊约束）
    if (exampleUuids.length > 0) {
      const places = await this.prisma.place.findMany({
        where: {
          uuid: { in: exampleUuids },
        },
      });

      for (const place of places) {
        candidates.push(this.placeToActivityCandidate(place, 'core'));
      }
    }

    // 2. 根据 POI 类型查询（从 metadata 中匹配）+ 走廊空间约束
    if (poiTypes.length > 0) {
      const typeConditions = poiTypes
        .map((type: string) => `metadata->>'canonicalType' = '${type.replace(/'/g, "''")}'`)
        .join(' OR ');

      const regionFilter = regions && regions.length > 0
        ? Prisma.sql`AND metadata->>'regionKey' = ANY(${regions})`
        : Prisma.sql``;

      // 走廊空间约束
      // 优化：如果 corridorGeom 已经是 geography 类型（从数据库读取），直接使用
      // 如果是字符串（WKT），才使用 ST_GeomFromText 转换
      let corridorFilter = Prisma.sql``;
      if (corridorGeom) {
        // 检查 corridorGeom 是否是字符串（WKT）还是已经是 geography 类型
        // 如果是字符串，使用 ST_GeomFromText；否则直接使用
        const isWktString = typeof corridorGeom === 'string' && 
          (corridorGeom.startsWith('LINESTRING') || 
           corridorGeom.startsWith('MULTILINESTRING') || 
           corridorGeom.startsWith('POLYGON'));
        
        if (isWktString) {
          // WKT 字符串，需要转换
          corridorFilter = Prisma.sql`
            AND ST_DWithin(
              location::geography,
              ST_GeomFromText(${corridorGeom}, 4326)::geography,
              ${bufferMeters}
            )
          `;
        } else {
          // 已经是 geography 类型，直接使用（从数据库读取的情况）
          // 注意：这里假设 corridorGeom 是 geography 类型的值
          // 实际使用时，如果是从 RouteDirection 表读取，应该已经是 geography 类型
          corridorFilter = Prisma.sql`
            AND ST_DWithin(
              location::geography,
              ${corridorGeom}::geography,
              ${bufferMeters}
            )
          `;
        }
      }

      const places = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM "Place"
        WHERE 
          location IS NOT NULL
          AND (${Prisma.raw(typeConditions)})
          ${regionFilter}
          ${corridorFilter}
        LIMIT 50
      `;

      for (const place of places) {
        // 避免重复
        if (!candidates.find(c => c.id === place.uuid)) {
          candidates.push(this.placeToActivityCandidate(place, 'recommended'));
        }
      }
    }

    // 3. 根据路线方向的 regions 查询（如果没有指定 regions）+ 走廊空间约束
    if (!regions || regions.length === 0) {
      const routeRegions = recommendation.routeDirection.regions || [];
      if (routeRegions.length > 0) {
        let corridorFilter = Prisma.sql``;
        if (corridorGeom) {
          // 优化：避免不必要的 ST_GeomFromText 转换
          const isWktString = typeof corridorGeom === 'string' && 
            (corridorGeom.startsWith('LINESTRING') || 
             corridorGeom.startsWith('MULTILINESTRING') || 
             corridorGeom.startsWith('POLYGON'));
          
          if (isWktString) {
            corridorFilter = Prisma.sql`
              AND ST_DWithin(
                location::geography,
                ST_GeomFromText(${corridorGeom}, 4326)::geography,
                ${bufferMeters}
              )
            `;
          } else {
            corridorFilter = Prisma.sql`
              AND ST_DWithin(
                location::geography,
                ${corridorGeom}::geography,
                ${bufferMeters}
              )
            `;
          }
        }

        const places = await this.prisma.$queryRaw<any[]>`
          SELECT * FROM "Place"
          WHERE 
            location IS NOT NULL
            AND metadata->>'regionKey' = ANY(${routeRegions})
            ${corridorFilter}
          LIMIT 30
        `;

        for (const place of places) {
          if (!candidates.find(c => c.id === place.uuid)) {
            candidates.push(this.placeToActivityCandidate(place, 'optional'));
          }
        }
      }
    }

    // 4. 如果走廊约束生效，记录过滤效果
    if (corridorGeom) {
      this.logger.log(
        `走廊空间约束生效，生成了 ${candidates.length} 个候选 POI（buffer=${bufferMeters}m）`
      );
    }

    this.logger.log(`生成了 ${candidates.length} 个候选 POI`);
    
    // 缓存结果
    if (this.cacheService) {
      await this.cacheService.cachePoiPool(
        recommendation.routeDirection.id,
        bufferMeters,
        candidates,
        recommendation.signaturePois
      );
    }
    
    return candidates;
  }

  /**
   * 将 Place 转换为 ActivityCandidate
   */
  private placeToActivityCandidate(
    place: any,
    priority: 'core' | 'recommended' | 'optional' = 'optional'
  ): ActivityCandidate {
    const metadata = place.metadata as any;
    const location = place.location
      ? this.extractLocation(place.location)
      : undefined;

    // 推断 ActivityType
    const activityType = this.inferActivityType(place.category, metadata);

    // 推断持续时间（分钟）
    const durationMin = this.inferDuration(metadata, activityType);

    // 推断风险等级
    const riskLevel = this.inferRiskLevel(metadata);

    // 推断天气敏感度
    const weatherSensitivity = this.inferWeatherSensitivity(
      activityType,
      metadata
    );

    return {
      id: place.uuid,
      name: {
        zh: place.nameCN,
        en: place.nameEN || undefined,
      },
      type: activityType,
      location: location
        ? {
            point: location,
            address: place.address || undefined,
            region: metadata?.regionKey || undefined,
          }
        : undefined,
      indoorOutdoor: this.inferIndoorOutdoor(activityType, metadata),
      durationMin,
      cost: place.rating
        ? {
            amount: 0, // 需要从其他地方获取价格
            currency: 'USD',
          }
        : undefined,
      riskLevel,
      weatherSensitivity,
      intentTags: this.extractIntentTags(metadata, place.category),
      qualityScore: place.rating ? place.rating / 5.0 : 0.5,
      mustSee: priority === 'core',
    };
  }

  /**
   * 从 PostGIS geography 提取经纬度
   */
  private extractLocation(location: any): { lat: number; lng: number } | undefined {
    // PostGIS geography 格式处理
    // 这里需要根据实际存储格式解析
    // 假设是 WKT 格式：POINT(lng lat) 或 JSON 格式
    if (typeof location === 'string') {
      // 尝试解析 WKT
      const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    } else if (location && typeof location === 'object') {
      // JSON 格式
      if (location.lat && location.lng) {
        return { lat: location.lat, lng: location.lng };
      }
      if (location.coordinates && Array.isArray(location.coordinates)) {
        return { lng: location.coordinates[0], lat: location.coordinates[1] };
      }
    }
    return undefined;
  }

  /**
   * 推断 ActivityType
   */
  private inferActivityType(
    category: string,
    metadata: any
  ): ActivityCandidate['type'] {
    const canonicalType = metadata?.canonicalType?.toLowerCase() || '';
    const categoryLower = category.toLowerCase();

    if (canonicalType.includes('waterfall') || canonicalType.includes('volcano')) {
      return 'nature';
    }
    if (canonicalType.includes('museum') || canonicalType.includes('temple')) {
      return 'museum';
    }
    if (categoryLower === 'restaurant') {
      return 'food';
    }
    if (categoryLower === 'shopping') {
      return 'shopping';
    }
    if (canonicalType.includes('hotel') || canonicalType.includes('lodge')) {
      return 'hotel';
    }
    return 'sightseeing';
  }

  /**
   * 推断持续时间
   */
  private inferDuration(metadata: any, activityType: ActivityCandidate['type']): number {
    // 根据类型和元数据推断
    if (activityType === 'nature') {
      return 120; // 2 小时
    }
    if (activityType === 'museum') {
      return 90; // 1.5 小时
    }
    if (activityType === 'food') {
      return 60; // 1 小时
    }
    return 60; // 默认 1 小时
  }

  /**
   * 推断风险等级
   */
  private inferRiskLevel(metadata: any): ActivityCandidate['riskLevel'] {
    const elevation = metadata?.elevationMeters;
    if (elevation && elevation > 4000) {
      return 'high';
    }
    if (elevation && elevation > 3000) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * 推断天气敏感度
   */
  private inferWeatherSensitivity(
    activityType: ActivityCandidate['type'],
    metadata: any
  ): 0 | 1 | 2 | 3 {
    if (activityType === 'nature') {
      return 3; // 高度敏感
    }
    if (activityType === 'museum') {
      return 0; // 不敏感
    }
    return 2; // 中等敏感
  }

  /**
   * 推断室内/室外
   */
  private inferIndoorOutdoor(
    activityType: ActivityCandidate['type'],
    metadata: any
  ): ActivityCandidate['indoorOutdoor'] {
    if (activityType === 'museum' || activityType === 'food') {
      return 'indoor';
    }
    if (activityType === 'nature') {
      return 'outdoor';
    }
    return 'mixed';
  }

  /**
   * 提取意图标签
   */
  private extractIntentTags(metadata: any, category: string): string[] {
    const tags: string[] = [];

    if (metadata?.tags && Array.isArray(metadata.tags)) {
      tags.push(...metadata.tags);
    }

    const canonicalType = metadata?.canonicalType?.toLowerCase() || '';
    if (canonicalType.includes('photography') || canonicalType.includes('viewpoint')) {
      tags.push('摄影');
    }
    if (canonicalType.includes('hiking') || canonicalType.includes('trail')) {
      tags.push('徒步');
    }
    if (canonicalType.includes('ferry') || canonicalType.includes('cruise')) {
      tags.push('出海');
    }

    return tags;
  }
}

