// src/trips/readiness/services/dem-effort-metadata.service.ts

/**
 * DEM 体力消耗元数据服务
 * 
 * 基于 DEM 数据计算路线的体力消耗特征：
 * - 累计爬升/下降
 * - 最大坡度
 * - 最高/最低海拔
 * - 平均坡度
 * - 地形复杂度
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEMElevationService } from './dem-elevation.service';

export interface EffortMetadata {
  /** 累计爬升（米） */
  totalAscent: number;
  /** 累计下降（米） */
  totalDescent: number;
  /** 净爬升（米） */
  netElevationGain: number;
  /** 最高海拔（米） */
  maxElevation: number;
  /** 最低海拔（米） */
  minElevation: number;
  /** 平均海拔（米） */
  avgElevation: number;
  /** 最大坡度（百分比，0-100） */
  maxSlope: number;
  /** 平均坡度（百分比） */
  avgSlope: number;
  /** 总距离（米） */
  totalDistance: number;
  /** 体力消耗评分（0-100，基于爬升和坡度） */
  effortScore: number;
  /** 难度等级（easy/moderate/hard/extreme） */
  difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
  /** 预计时长（分钟，基于距离和爬升） */
  estimatedDuration: number;
  /** 建议休息点数量 */
  suggestedRestPoints: number;
  /** 地形复杂度（0-1，基于坡度变化） */
  terrainComplexity: number;
  /** 海拔变化详情（每个点的海拔） */
  elevationProfile?: Array<{ distance: number; elevation: number; slope: number }>;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  distance?: number; // 距离起点的距离（米），如果未提供则计算
}

@Injectable()
export class DEMEffortMetadataService {
  private readonly logger = new Logger(DEMEffortMetadataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly demService: DEMElevationService
  ) {}

  /**
   * 计算两点之间的距离（米）
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 计算坡度（百分比）
   */
  private calculateSlope(
    elevation1: number,
    elevation2: number,
    distance: number
  ): number {
    if (distance === 0) return 0;
    const elevationChange = elevation2 - elevation1;
    return (elevationChange / distance) * 100;
  }

  /**
   * 计算路线的体力消耗元数据
   * 
   * @param points 路线点数组（按顺序）
   * @param options 选项
   */
  async calculateEffortMetadata(
    points: RoutePoint[],
    options: {
      /** 活动类型（影响速度计算） */
      activityType?: 'walking' | 'cycling' | 'driving';
      /** 采样间隔（米），用于详细海拔剖面，默认100米 */
      samplingInterval?: number;
      /** 是否返回详细海拔剖面 */
      includeElevationProfile?: boolean;
    } = {}
  ): Promise<EffortMetadata> {
    const {
      activityType = 'walking',
      samplingInterval = 100,
      includeElevationProfile = false,
    } = options;

    if (points.length < 2) {
      throw new Error('路线至少需要2个点');
    }

    // 1. 获取所有点的海拔
    const elevations: number[] = [];
    for (const point of points) {
      const elevation = await this.demService.getElevation(point.lat, point.lng);
      if (elevation === null) {
        this.logger.warn(`无法获取海拔 (${point.lat}, ${point.lng})，使用前一点海拔或0`);
        elevations.push(elevations.length > 0 ? elevations[elevations.length - 1] : 0);
      } else {
        elevations.push(elevation);
      }
    }

    // 2. 计算距离和坡度
    let totalDistance = 0;
    let totalAscent = 0;
    let totalDescent = 0;
    const slopes: number[] = [];
    const elevationProfile: Array<{ distance: number; elevation: number; slope: number }> = [];

    for (let i = 0; i < points.length - 1; i++) {
      const point1 = points[i];
      const point2 = points[i + 1];
      
      // 计算距离
      const segmentDistance = point2.distance !== undefined && point1.distance !== undefined
        ? point2.distance - point1.distance
        : this.calculateDistance(point1.lat, point1.lng, point2.lat, point2.lng);
      
      totalDistance += segmentDistance;

      const elevation1 = elevations[i];
      const elevation2 = elevations[i + 1];
      const slope = this.calculateSlope(elevation1, elevation2, segmentDistance);
      slopes.push(Math.abs(slope));

      // 累计爬升/下降
      if (elevation2 > elevation1) {
        totalAscent += elevation2 - elevation1;
      } else {
        totalDescent += elevation1 - elevation2;
      }

      if (includeElevationProfile) {
        elevationProfile.push({
          distance: totalDistance,
          elevation: elevation2,
          slope: slope,
        });
      }
    }

    // 3. 计算统计值
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const avgElevation = elevations.reduce((sum, e) => sum + e, 0) / elevations.length;
    const netElevationGain = maxElevation - minElevation;
    const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;
    const avgSlope = slopes.length > 0 ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length : 0;

    // 4. 计算地形复杂度（基于坡度变化的标准差）
    const slopeVariance = slopes.length > 0
      ? slopes.reduce((sum, s) => sum + Math.pow(s - avgSlope, 2), 0) / slopes.length
      : 0;
    const terrainComplexity = Math.min(1, Math.sqrt(slopeVariance) / 20); // 归一化到0-1

    // 5. 计算体力消耗评分（0-100）
    // 基于：距离、爬升、坡度
    const distanceScore = Math.min(100, (totalDistance / 1000) * 10); // 每公里10分，最高100
    const ascentScore = Math.min(100, (totalAscent / 100) * 5); // 每100米爬升5分，最高100
    const slopeScore = Math.min(100, maxSlope * 2); // 每1%坡度2分，最高100
    const effortScore = Math.min(100, (distanceScore + ascentScore + slopeScore) / 3);

    // 6. 确定难度等级
    let difficulty: 'easy' | 'moderate' | 'hard' | 'extreme';
    if (effortScore < 30) {
      difficulty = 'easy';
    } else if (effortScore < 60) {
      difficulty = 'moderate';
    } else if (effortScore < 85) {
      difficulty = 'hard';
    } else {
      difficulty = 'extreme';
    }

    // 7. 估算时长（分钟）
    // 基础速度：步行4km/h，骑行15km/h，驾车60km/h
    const baseSpeed = {
      walking: 4000, // 米/小时
      cycling: 15000,
      driving: 60000,
    }[activityType];

    // 爬升惩罚：每100米爬升增加10%时间
    const ascentPenalty = 1 + (totalAscent / 100) * 0.1;
    const estimatedDuration = (totalDistance / baseSpeed) * 60 * ascentPenalty; // 分钟

    // 8. 建议休息点（基于难度和距离）
    const suggestedRestPoints = Math.max(
      0,
      Math.floor((effortScore / 20) + (totalDistance / 5000))
    );

    return {
      totalAscent,
      totalDescent,
      netElevationGain,
      maxElevation,
      minElevation,
      avgElevation,
      maxSlope,
      avgSlope,
      totalDistance,
      effortScore,
      difficulty,
      estimatedDuration,
      suggestedRestPoints,
      terrainComplexity,
      elevationProfile: includeElevationProfile ? elevationProfile : undefined,
    };
  }

  /**
   * 比较两条路线的消耗差异
   */
  async compareRoutes(
    route1: RoutePoint[],
    route2: RoutePoint[],
    options?: {
      activityType?: 'walking' | 'cycling' | 'driving';
    }
  ): Promise<{
    route1: EffortMetadata;
    route2: EffortMetadata;
    comparison: {
      effortDifference: number; // 路线2相对于路线1的消耗差异（百分比）
      keyDifferences: string[];
      recommendation: string;
    };
  }> {
    const [metadata1, metadata2] = await Promise.all([
      this.calculateEffortMetadata(route1, options),
      this.calculateEffortMetadata(route2, options),
    ]);

    const effortDifference = ((metadata2.effortScore - metadata1.effortScore) / metadata1.effortScore) * 100;
    
    const keyDifferences: string[] = [];
    if (Math.abs(metadata2.totalAscent - metadata1.totalAscent) > 100) {
      keyDifferences.push(
        `爬升差异：${Math.abs(metadata2.totalAscent - metadata1.totalAscent)}m`
      );
    }
    if (Math.abs(metadata2.maxSlope - metadata1.maxSlope) > 5) {
      keyDifferences.push(
        `最大坡度差异：${Math.abs(metadata2.maxSlope - metadata1.maxSlope).toFixed(1)}%`
      );
    }
    if (Math.abs(metadata2.totalDistance - metadata1.totalDistance) > 500) {
      keyDifferences.push(
        `距离差异：${Math.abs(metadata2.totalDistance - metadata1.totalDistance).toFixed(0)}m`
      );
    }

    let recommendation = '';
    if (effortDifference > 20) {
      recommendation = `路线2消耗明显更大（+${effortDifference.toFixed(1)}%），建议选择路线1`;
    } else if (effortDifference < -20) {
      recommendation = `路线1消耗明显更大（${effortDifference.toFixed(1)}%），建议选择路线2`;
    } else {
      recommendation = '两条路线消耗相近，可根据其他因素选择';
    }

    return {
      route1: metadata1,
      route2: metadata2,
      comparison: {
        effortDifference,
        keyDifferences,
        recommendation,
      },
    };
  }

  /**
   * 检测路线中的关键点（最高点、最陡坡等）
   */
  async detectKeyPoints(
    points: RoutePoint[]
  ): Promise<{
    highestPoint: { index: number; lat: number; lng: number; elevation: number };
    steepestSegment: { startIndex: number; endIndex: number; slope: number };
    mountainPasses: Array<{ index: number; lat: number; lng: number; elevation: number }>;
  }> {
    const elevations: number[] = [];
    for (const point of points) {
      const elevation = await this.demService.getElevation(point.lat, point.lng);
      elevations.push(elevation ?? 0);
    }

    // 找到最高点
    const maxElevation = Math.max(...elevations);
    const highestIndex = elevations.indexOf(maxElevation);
    const highestPoint = {
      index: highestIndex,
      lat: points[highestIndex].lat,
      lng: points[highestIndex].lng,
      elevation: maxElevation,
    };

    // 找到最陡坡段
    let maxSlope = 0;
    let steepestStart = 0;
    let steepestEnd = 1;
    for (let i = 0; i < points.length - 1; i++) {
      const distance = this.calculateDistance(
        points[i].lat,
        points[i].lng,
        points[i + 1].lat,
        points[i + 1].lng
      );
      const slope = Math.abs(this.calculateSlope(elevations[i], elevations[i + 1], distance));
      if (slope > maxSlope) {
        maxSlope = slope;
        steepestStart = i;
        steepestEnd = i + 1;
      }
    }

    // 检测山口/垭口（局部最高点，且海拔>3000m）
    const mountainPasses: Array<{ index: number; lat: number; lng: number; elevation: number }> = [];
    for (let i = 1; i < points.length - 1; i++) {
      if (
        elevations[i] > elevations[i - 1] &&
        elevations[i] > elevations[i + 1] &&
        elevations[i] > 3000
      ) {
        mountainPasses.push({
          index: i,
          lat: points[i].lat,
          lng: points[i].lng,
          elevation: elevations[i],
        });
      }
    }

    return {
      highestPoint,
      steepestSegment: {
        startIndex: steepestStart,
        endIndex: steepestEnd,
        slope: maxSlope,
      },
      mountainPasses,
    };
  }
}

