// src/poi/services/poi-route-affinity.service.ts
/**
 * POI 路线亲和度服务
 * 
 * P2.2: POI 的路线亲和度
 * 
 * 计算POI与路线方向的匹配度，用于优化POI选择和排序
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  POIRouteAffinity,
  AffinityScoreBreakdown,
  POIAffinityCalculationOptions,
  POIInfo,
} from '../interfaces/poi-route-affinity.interface';
import {
  RouteDirectionData,
  SignaturePois,
  ObjectiveWeights,
  Seasonality,
} from '../../route-directions/interfaces/route-direction.interface';
import { Prisma } from '@prisma/client';

@Injectable()
export class POIRouteAffinityService {
  private readonly logger = new Logger(POIRouteAffinityService.name);

  // 默认权重
  private readonly DEFAULT_WEIGHTS = {
    tagMatch: 0.25,
    typeMatch: 0.30,
    locationMatch: 0.15,
    objectiveMatch: 0.15,
    exampleBonus: 0.10,
    seasonalityMatch: 0.05,
  };

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 计算POI与路线方向的亲和度
   */
  async calculateAffinity(
    poi: POIInfo,
    routeDirection: RouteDirectionData & { id: number },
    options: POIAffinityCalculationOptions = {}
  ): Promise<POIRouteAffinity> {
    const {
      currentMonth,
      considerLocation = true,
      considerSeasonality = true,
      customWeights = {},
    } = options;

    const weights = { ...this.DEFAULT_WEIGHTS, ...customWeights };

    // 1. 标签匹配
    const tagMatch = this.calculateTagMatch(poi, routeDirection);

    // 2. 类型匹配
    const typeMatch = this.calculateTypeMatch(poi, routeDirection.signaturePois);

    // 3. 地理位置匹配
    const locationMatch = considerLocation
      ? await this.calculateLocationMatch(poi, routeDirection)
      : { score: 50, weight: 0, inRegion: false, inCorridor: false };

    // 4. 目标权重匹配
    const objectiveMatch = this.calculateObjectiveMatch(
      poi,
      routeDirection.constraints?.objectives
    );

    // 5. 示例POI加分
    const exampleBonus = this.calculateExampleBonus(
      poi,
      routeDirection.signaturePois
    );

    // 6. 季节性匹配
    const seasonalityMatch = considerSeasonality
      ? this.calculateSeasonalityMatch(
          routeDirection.seasonality,
          currentMonth
        )
      : { score: 50, weight: 0, isBestMonth: false, isAvoidMonth: false };

    // 计算总分
    const breakdown: AffinityScoreBreakdown = {
      tagMatch: { ...tagMatch, weight: weights.tagMatch },
      typeMatch: { ...typeMatch, weight: weights.typeMatch },
      locationMatch: { ...locationMatch, weight: weights.locationMatch },
      objectiveMatch: { ...objectiveMatch, weight: weights.objectiveMatch },
      exampleBonus: { ...exampleBonus, weight: weights.exampleBonus },
      seasonalityMatch: { ...seasonalityMatch, weight: weights.seasonalityMatch },
    };

    const totalScore =
      tagMatch.score * weights.tagMatch +
      typeMatch.score * weights.typeMatch +
      locationMatch.score * weights.locationMatch +
      objectiveMatch.score * weights.objectiveMatch +
      exampleBonus.score * weights.exampleBonus +
      seasonalityMatch.score * weights.seasonalityMatch;

    // 生成匹配原因
    const matchReasons = this.generateMatchReasons(breakdown, poi, routeDirection);
    const mismatchReasons = this.generateMismatchReasons(breakdown, poi, routeDirection);

    return {
      poiId: poi.id,
      routeDirectionId: routeDirection.id,
      affinityScore: Math.round(totalScore * 100) / 100,
      scoreBreakdown: breakdown,
      matchReasons,
      mismatchReasons: mismatchReasons.length > 0 ? mismatchReasons : undefined,
    };
  }

  /**
   * 批量计算POI亲和度
   */
  async calculateAffinities(
    pois: POIInfo[],
    routeDirection: RouteDirectionData & { id: number },
    options: POIAffinityCalculationOptions = {}
  ): Promise<POIRouteAffinity[]> {
    const affinities = await Promise.all(
      pois.map(poi => this.calculateAffinity(poi, routeDirection, options))
    );

    // 按亲和度分数降序排序
    return affinities.sort((a, b) => b.affinityScore - a.affinityScore);
  }

  /**
   * 计算标签匹配分数
   */
  private calculateTagMatch(
    poi: POIInfo,
    routeDirection: RouteDirectionData
  ): Omit<AffinityScoreBreakdown['tagMatch'], 'weight'> {
    const poiTags = poi.tags || [];
    const routeTags = routeDirection.tags || [];

    if (routeTags.length === 0) {
      return {
        score: 50, // 如果没有路线标签，给中等分数
        matchedTags: [],
        totalRouteTags: 0,
      };
    }

    const matchedTags = poiTags.filter(tag => routeTags.includes(tag));
    const matchRatio = matchedTags.length / routeTags.length;
    const score = Math.min(100, matchRatio * 100 + (matchedTags.length > 0 ? 20 : 0)); // 有匹配至少20分

    return {
      score,
      matchedTags,
      totalRouteTags: routeTags.length,
    };
  }

  /**
   * 计算类型匹配分数
   */
  private calculateTypeMatch(
    poi: POIInfo,
    signaturePois?: SignaturePois
  ): Omit<AffinityScoreBreakdown['typeMatch'], 'weight'> {
    if (!signaturePois || !signaturePois.types || signaturePois.types.length === 0) {
      return {
        score: 50,
        isSignatureType: false,
      };
    }

    const poiType = poi.type || poi.category || '';
    const isSignatureType = signaturePois.types.includes(poiType);
    const typeWeight = signaturePois.weights?.[poiType] || 1.0;

    let score = 0;
    if (isSignatureType) {
      score = 80 + (typeWeight - 1) * 20; // 基础80分，根据权重调整
      score = Math.min(100, score);
    } else {
      // 部分匹配（如子类型匹配）
      const partialMatch = signaturePois.types.some(type =>
        poiType.toLowerCase().includes(type.toLowerCase()) ||
        type.toLowerCase().includes(poiType.toLowerCase())
      );
      score = partialMatch ? 40 : 10;
    }

    return {
      score,
      poiType,
      isSignatureType,
      typeWeight: isSignatureType ? typeWeight : undefined,
    };
  }

  /**
   * 计算地理位置匹配分数
   */
  private async calculateLocationMatch(
    poi: POIInfo,
    routeDirection: RouteDirectionData
  ): Promise<Omit<AffinityScoreBreakdown['locationMatch'], 'weight'>> {
    if (!poi.location) {
      return {
        score: 0,
        inRegion: false,
        inCorridor: false,
      };
    }

    const routeRegions = routeDirection.regions || [];
    const poiRegion = poi.location.regionKey;

    // 检查是否在区域内
    const inRegion = poiRegion ? routeRegions.includes(poiRegion) : false;

    // 检查是否在走廊内（需要查询数据库）
    let inCorridor = false;
    let distanceToCorridorKm: number | undefined;

    // corridorGeom可能在metadata中，也可能在routeDirection对象本身
    const corridorGeom = (routeDirection as any).corridorGeom || routeDirection.metadata?.corridorGeom;
    if (corridorGeom) {
      try {
        const result = await this.prisma.$queryRaw<Array<{ distance_km: number; in_corridor: boolean }>>`
          SELECT 
            ST_Distance(
              ST_SetSRID(ST_MakePoint(${poi.location.lng}, ${poi.location.lat}), 4326)::geography,
              ${Prisma.raw(
                typeof corridorGeom === 'string'
                  ? `ST_GeomFromText('${corridorGeom}', 4326)::geography`
                  : `${corridorGeom}::geography`
              )}
            ) / 1000.0 as distance_km,
            ST_DWithin(
              ST_SetSRID(ST_MakePoint(${poi.location.lng}, ${poi.location.lat}), 4326)::geography,
              ${Prisma.raw(
                typeof corridorGeom === 'string'
                  ? `ST_GeomFromText('${corridorGeom}', 4326)::geography`
                  : `${corridorGeom}::geography`
              )},
              50000
            ) as in_corridor
        `;

        if (result && result.length > 0) {
          inCorridor = result[0].in_corridor;
          distanceToCorridorKm = result[0].distance_km;
        }
      } catch (error) {
        this.logger.warn(`计算走廊距离失败: ${error}`);
      }
    }

    // 计算分数
    let score = 0;
    if (inCorridor) {
      score = 100; // 在走廊内，满分
    } else if (inRegion) {
      score = 70; // 在区域内但不在走廊内
    } else if (distanceToCorridorKm !== undefined && distanceToCorridorKm < 100) {
      score = 50 - (distanceToCorridorKm / 100) * 30; // 距离走廊100km内，根据距离降分
    } else {
      score = 10; // 不在区域内且距离较远
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      inRegion,
      inCorridor,
      distanceToCorridorKm,
    };
  }

  /**
   * 计算目标权重匹配分数
   */
  private calculateObjectiveMatch(
    poi: POIInfo,
    objectives?: ObjectiveWeights
  ): Omit<AffinityScoreBreakdown['objectiveMatch'], 'weight'> {
    if (!objectives) {
      return {
        score: 50,
        matchedObjectives: [],
      };
    }

    const poiTags = poi.tags || [];
    const matchedObjectives: string[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    // 检查各种目标偏好
    const objectiveMappings: Record<string, string[]> = {
      preferViewpoints: ['viewpoint', '观景点', '摄影', 'photography'],
      preferHotSpring: ['hot_spring', '温泉', 'spa'],
      preferPhotography: ['photography', '摄影', 'viewpoint', '观景点'],
      preferHiking: ['hiking', '徒步', 'trail', '步道'],
      preferCulture: ['museum', '博物馆', 'temple', '寺庙', 'culture', '文化'],
      preferNature: ['nature', '自然', 'waterfall', '瀑布', 'volcano', '火山'],
    };

    for (const [objectiveKey, objectiveWeight] of Object.entries(objectives)) {
      if (typeof objectiveWeight === 'number' && objectiveWeight > 0) {
        totalWeight += objectiveWeight;
        const relatedTags = objectiveMappings[objectiveKey] || [];
        const hasMatch = relatedTags.some(tag =>
          poiTags.some(poiTag => poiTag.toLowerCase().includes(tag.toLowerCase()))
        );

        if (hasMatch) {
          matchedObjectives.push(objectiveKey);
          matchedWeight += objectiveWeight;
        }
      }
    }

    const score = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 50;

    return {
      score,
      matchedObjectives,
      objectiveWeights: objectives,
    };
  }

  /**
   * 计算示例POI加分
   */
  private calculateExampleBonus(
    poi: POIInfo,
    signaturePois?: SignaturePois
  ): Omit<AffinityScoreBreakdown['exampleBonus'], 'weight'> {
    if (!signaturePois || !signaturePois.examples || signaturePois.examples.length === 0) {
      return {
        score: 0,
        isExample: false,
      };
    }

    const isExample = signaturePois.examples.includes(poi.id);
    return {
      score: isExample ? 100 : 0,
      isExample,
    };
  }

  /**
   * 计算季节性匹配分数
   */
  private calculateSeasonalityMatch(
    seasonality?: Seasonality,
    currentMonth?: number
  ): Omit<AffinityScoreBreakdown['seasonalityMatch'], 'weight'> {
    if (!seasonality || !currentMonth) {
      return {
        score: 50,
        isBestMonth: false,
        isAvoidMonth: false,
      };
    }

    const bestMonths = seasonality.bestMonths || [];
    const avoidMonths = seasonality.avoidMonths || [];

    const isBestMonth = bestMonths.includes(currentMonth);
    const isAvoidMonth = avoidMonths.includes(currentMonth);

    let score = 50;
    if (isBestMonth) {
      score = 100;
    } else if (isAvoidMonth) {
      score = 0;
    } else if (bestMonths.length > 0) {
      // 计算距离最佳月份的远近
      const distances = bestMonths.map(month => {
        const dist = Math.abs(month - currentMonth);
        return Math.min(dist, 12 - dist); // 考虑跨年
      });
      const minDistance = Math.min(...distances);
      score = 50 + (5 - minDistance) * 10; // 距离越近分数越高
      score = Math.max(30, Math.min(90, score));
    }

    return {
      score,
      currentMonth,
      isBestMonth,
      isAvoidMonth,
    };
  }

  /**
   * 生成匹配原因
   */
  private generateMatchReasons(
    breakdown: AffinityScoreBreakdown,
    poi: POIInfo,
    routeDirection: RouteDirectionData
  ): string[] {
    const reasons: string[] = [];

    if (breakdown.tagMatch.matchedTags.length > 0) {
      reasons.push(
        `标签匹配：${breakdown.tagMatch.matchedTags.join('、')}`
      );
    }

    if (breakdown.typeMatch.isSignatureType) {
      reasons.push(
        `类型匹配：${breakdown.typeMatch.poiType}（路线代表性类型）`
      );
    }

    if (breakdown.locationMatch.inCorridor) {
      reasons.push('位于路线走廊内');
    } else if (breakdown.locationMatch.inRegion) {
      reasons.push(`位于路线区域：${poi.location?.regionKey}`);
    }

    if (breakdown.objectiveMatch.matchedObjectives.length > 0) {
      reasons.push(
        `符合路线偏好：${breakdown.objectiveMatch.matchedObjectives.join('、')}`
      );
    }

    if (breakdown.exampleBonus.isExample) {
      reasons.push('路线推荐示例POI');
    }

    if (breakdown.seasonalityMatch.isBestMonth) {
      reasons.push(`当前月份（${breakdown.seasonalityMatch.currentMonth}月）为最佳旅行时间`);
    }

    return reasons;
  }

  /**
   * 生成不匹配原因
   */
  private generateMismatchReasons(
    breakdown: AffinityScoreBreakdown,
    poi: POIInfo,
    routeDirection: RouteDirectionData
  ): string[] {
    const reasons: string[] = [];

    if (breakdown.tagMatch.score < 30) {
      reasons.push('标签匹配度低');
    }

    if (!breakdown.typeMatch.isSignatureType && breakdown.typeMatch.score < 30) {
      reasons.push('类型不匹配路线特征');
    }

    if (!breakdown.locationMatch.inRegion && !breakdown.locationMatch.inCorridor) {
      reasons.push('不在路线覆盖区域内');
    }

    if (breakdown.seasonalityMatch.isAvoidMonth) {
      reasons.push(
        `当前月份（${breakdown.seasonalityMatch.currentMonth}月）为路线禁忌时间`
      );
    }

    return reasons;
  }
}

