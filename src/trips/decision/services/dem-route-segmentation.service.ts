// src/trips/decision/services/dem-route-segmentation.service.ts
/**
 * DEM 驱动的路线自动拆段服务
 * 
 * P1.1.2: 自动拆段
 * - 沿corridor做elevation profile
 * - 识别过陡段（steep sections）
 * - 识别体力断点（energy breakpoints）
 * - 识别强制休息点（mandatory rest points）
 * 
 * 功能：
 * 1. 从RouteDirection的corridorGeom提取坐标点
 * 2. 沿corridor采样，生成详细的elevation profile
 * 3. 识别过陡段（坡度>15%的连续段）
 * 4. 识别体力断点（累计体力消耗超过阈值）
 * 5. 识别强制休息点（连续高海拔、连续上升等）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
import { DEMEffortMetadataService, RoutePoint } from '../../dem/services/dem-effort-metadata.service';

export interface ElevationProfilePoint {
  /** 距离起点的距离（米） */
  distance: number;
  /** 纬度 */
  lat: number;
  /** 经度 */
  lng: number;
  /** 海拔（米） */
  elevation: number;
  /** 坡度（百分比，正数表示上升，负数表示下降） */
  slope: number;
  /** 累计爬升（米） */
  cumulativeAscent: number;
  /** 累计体力消耗（归一化，0-100） */
  cumulativeEnergyCost: number;
}

export interface SteepSection {
  /** 起始距离（米） */
  startDistance: number;
  /** 结束距离（米） */
  endDistance: number;
  /** 起始点索引 */
  startIndex: number;
  /** 结束点索引 */
  endIndex: number;
  /** 平均坡度（百分比） */
  avgSlope: number;
  /** 最大坡度（百分比） */
  maxSlope: number;
  /** 长度（米） */
  length: number;
  /** 累计爬升（米） */
  totalAscent: number;
  /** 严重程度（LOW/MEDIUM/HIGH） */
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface EnergyBreakpoint {
  /** 距离起点的距离（米） */
  distance: number;
  /** 点索引 */
  index: number;
  /** 累计体力消耗（归一化，0-100） */
  cumulativeEnergyCost: number;
  /** 建议休息时长（分钟） */
  suggestedRestDuration: number;
  /** 原因 */
  reason: string;
}

export interface MandatoryRestPoint {
  /** 距离起点的距离（米） */
  distance: number;
  /** 点索引 */
  index: number;
  /** 海拔（米） */
  elevation: number;
  /** 连续高海拔天数（如果适用） */
  consecutiveHighAltitudeDays?: number;
  /** 连续上升高度（米） */
  consecutiveAscent?: number;
  /** 原因 */
  reason: string;
  /** 建议休息时长（分钟） */
  suggestedRestDuration: number;
  /** 严重程度 */
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RouteSegmentation {
  /** 海拔剖面 */
  elevationProfile: ElevationProfilePoint[];
  /** 过陡段列表 */
  steepSections: SteepSection[];
  /** 体力断点列表 */
  energyBreakpoints: EnergyBreakpoint[];
  /** 强制休息点列表 */
  mandatoryRestPoints: MandatoryRestPoint[];
  /** 总距离（米） */
  totalDistance: number;
  /** 总爬升（米） */
  totalAscent: number;
  /** 总下降（米） */
  totalDescent: number;
  /** 最高海拔（米） */
  maxElevation: number;
  /** 最低海拔（米） */
  minElevation: number;
  /** 平均坡度（百分比） */
  avgSlope: number;
  /** 最大坡度（百分比） */
  maxSlope: number;
}

export interface SegmentationConfig {
  /** 采样间隔（米），默认100米 */
  samplingInterval?: number;
  /** 过陡段坡度阈值（百分比），默认15% */
  steepSlopeThreshold?: number;
  /** 过陡段最小长度（米），默认500米 */
  steepSectionMinLength?: number;
  /** 体力断点阈值（归一化，0-100），默认70 */
  energyBreakpointThreshold?: number;
  /** 高海拔阈值（米），默认3000米 */
  highAltitudeThreshold?: number;
  /** 连续上升阈值（米），默认1200米 */
  consecutiveAscentThreshold?: number;
  /** 基础体力消耗系数（每公里） */
  baseCostPerKm?: number;
  /** 爬升体力消耗系数（每米爬升） */
  ascentFactor?: number;
}

@Injectable()
export class DEMRouteSegmentationService {
  private readonly logger = new Logger(DEMRouteSegmentationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly demElevationService?: DEMElevationService,
    @Optional() private readonly demEffortService?: DEMEffortMetadataService,
  ) {
    if (!demElevationService || !demEffortService) {
      this.logger.warn('DEMElevationService or DEMEffortMetadataService not available. DEM features will be disabled.');
    }
  }

  /**
   * 对RouteDirection的corridor进行自动拆段分析
   * 
   * @param corridorGeom RouteDirection的corridorGeom（PostGIS geometry）
   * @param config 配置参数
   * @returns 拆段结果
   */
  async segmentRoute(
    corridorGeom: any,
    config: SegmentationConfig = {}
  ): Promise<RouteSegmentation> {
    const {
      samplingInterval = 100,
      steepSlopeThreshold = 15,
      steepSectionMinLength = 500,
      energyBreakpointThreshold = 70,
      highAltitudeThreshold = 3000,
      consecutiveAscentThreshold = 1200,
      baseCostPerKm = 5,
      ascentFactor = 0.1,
    } = config;

    // 1. 从corridorGeom提取坐标点
    const routePoints = await this.extractRoutePointsFromGeometry(corridorGeom, samplingInterval);

    if (routePoints.length < 2) {
      throw new Error('Corridor geometry must have at least 2 points');
    }

    // 2. 生成详细的elevation profile
    const elevationProfile = await this.generateElevationProfile(routePoints, {
      baseCostPerKm,
      ascentFactor,
    });

    // 3. 识别过陡段
    const steepSections = this.identifySteepSections(
      elevationProfile,
      steepSlopeThreshold,
      steepSectionMinLength,
    );

    // 4. 识别体力断点
    const energyBreakpoints = this.identifyEnergyBreakpoints(
      elevationProfile,
      energyBreakpointThreshold,
    );

    // 5. 识别强制休息点
    const mandatoryRestPoints = this.identifyMandatoryRestPoints(
      elevationProfile,
      highAltitudeThreshold,
      consecutiveAscentThreshold,
    );

    // 6. 计算统计信息
    const stats = this.calculateStatistics(elevationProfile);

    return {
      elevationProfile,
      steepSections,
      energyBreakpoints,
      mandatoryRestPoints,
      ...stats,
    };
  }

  /**
   * 从PostGIS geometry提取路线点
   */
  private async extractRoutePointsFromGeometry(
    geometry: any,
    samplingInterval: number
  ): Promise<RoutePoint[]> {
    try {
      // 方法1：如果geometry是字符串（WKT格式）
      if (typeof geometry === 'string') {
        return this.extractPointsFromWKT(geometry, samplingInterval);
      }

      // 方法2：如果geometry是GeoJSON格式
      if (geometry && typeof geometry === 'object' && geometry.type) {
        return this.extractPointsFromGeoJSON(geometry, samplingInterval);
      }

      // 方法3：使用PostGIS函数提取点
      return await this.extractPointsFromPostGIS(geometry, samplingInterval);
    } catch (error) {
      this.logger.error(`Failed to extract route points: ${error}`);
      throw error;
    }
  }

  /**
   * 从WKT格式提取点
   */
  private extractPointsFromWKT(wkt: string, samplingInterval: number): RoutePoint[] {
    const points: RoutePoint[] = [];

    // 匹配LINESTRING或MULTILINESTRING
    const lineStringMatch = wkt.match(/LINESTRING\s*\(([^)]+)\)/i);
    if (lineStringMatch) {
      const coords = lineStringMatch[1].split(',').map(s => s.trim());
      for (const coord of coords) {
        const [lng, lat] = coord.split(/\s+/).map(parseFloat);
        points.push({ lat, lng });
      }
    }

    // 如果点太少，直接返回
    if (points.length < 2) {
      return points;
    }

    // 如果采样间隔小于0，返回所有点
    if (samplingInterval <= 0) {
      return points;
    }

    // 对点进行采样
    return this.resamplePoints(points, samplingInterval);
  }

  /**
   * 从GeoJSON格式提取点
   */
  private extractPointsFromGeoJSON(geoJson: any, samplingInterval: number): RoutePoint[] {
    const points: RoutePoint[] = [];

    if (geoJson.type === 'LineString' && Array.isArray(geoJson.coordinates)) {
      for (const coord of geoJson.coordinates) {
        const [lng, lat] = coord;
        points.push({ lat, lng });
      }
    } else if (geoJson.type === 'MultiLineString' && Array.isArray(geoJson.coordinates)) {
      for (const lineString of geoJson.coordinates) {
        for (const coord of lineString) {
          const [lng, lat] = coord;
          points.push({ lat, lng });
        }
      }
    }

    if (points.length < 2) {
      return points;
    }

    if (samplingInterval <= 0) {
      return points;
    }

    return this.resamplePoints(points, samplingInterval);
  }

  /**
   * 使用PostGIS函数提取点
   */
  private async extractPointsFromPostGIS(
    geometry: any,
    samplingInterval: number
  ): Promise<RoutePoint[]> {
    try {
      // 使用ST_DumpPoints提取所有点
      const result = await this.prisma.$queryRaw<Array<{
        lat: number;
        lng: number;
      }>>`
        SELECT 
          ST_Y((dp).geom::geometry) as lat,
          ST_X((dp).geom::geometry) as lng
        FROM (
          SELECT ST_DumpPoints(${geometry}::geometry) as dp
        ) AS points
        ORDER BY (dp).path[1], (dp).path[2]
      `;

      const points: RoutePoint[] = result.map(r => ({ lat: r.lat, lng: r.lng }));

      if (points.length < 2) {
        return points;
      }

      if (samplingInterval <= 0) {
        return points;
      }

      return this.resamplePoints(points, samplingInterval);
    } catch (error) {
      this.logger.warn(`Failed to extract points from PostGIS, trying alternative method: ${error}`);
      // 如果PostGIS方法失败，尝试将geometry转换为GeoJSON
      const geoJsonResult = await this.prisma.$queryRaw<Array<{ geojson: any }>>`
        SELECT ST_AsGeoJSON(${geometry}::geometry)::jsonb as geojson
      `;

      if (geoJsonResult.length > 0 && geoJsonResult[0].geojson) {
        return this.extractPointsFromGeoJSON(geoJsonResult[0].geojson, samplingInterval);
      }

      throw new Error(`Failed to extract points from geometry: ${error}`);
    }
  }

  /**
   * 对点进行重采样（按距离间隔）
   */
  private resamplePoints(points: RoutePoint[], interval: number): RoutePoint[] {
    if (points.length < 2) {
      return points;
    }

    const resampled: RoutePoint[] = [points[0]]; // 总是包含起点
    let accumulatedDistance = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const segmentDistance = this.calculateDistance(prev.lat, prev.lng, curr.lat, curr.lng);
      accumulatedDistance += segmentDistance;

      // 如果累计距离达到采样间隔，添加点
      if (accumulatedDistance >= interval) {
        resampled.push(curr);
        accumulatedDistance = 0;
      }
    }

    // 总是包含终点
    if (resampled[resampled.length - 1] !== points[points.length - 1]) {
      resampled.push(points[points.length - 1]);
    }

    return resampled;
  }

  /**
   * 生成详细的elevation profile
   */
  private async generateElevationProfile(
    routePoints: RoutePoint[],
    config: { baseCostPerKm: number; ascentFactor: number }
  ): Promise<ElevationProfilePoint[]> {
    const profile: ElevationProfilePoint[] = [];
    let cumulativeDistance = 0;
    let cumulativeAscent = 0;
    let cumulativeEnergyCost = 0;
    let prevElevation: number | null = null;

    for (let i = 0; i < routePoints.length; i++) {
      const point = routePoints[i];
      
      // 获取海拔
      const elevation = await this.demElevationService?.getElevation(point.lat, point.lng) ?? 0;

      // 计算距离
      let segmentDistance = 0;
      if (i > 0) {
        const prevPoint = routePoints[i - 1];
        segmentDistance = this.calculateDistance(
          prevPoint.lat,
          prevPoint.lng,
          point.lat,
          point.lng
        );
        cumulativeDistance += segmentDistance;
      }

      // 计算坡度
      let slope = 0;
      if (prevElevation !== null && segmentDistance > 0) {
        const elevationChange = elevation - prevElevation;
        slope = (elevationChange / segmentDistance) * 100;
      }

      // 累计爬升
      if (prevElevation !== null && elevation > prevElevation) {
        cumulativeAscent += elevation - prevElevation;
      }

      // 计算体力消耗
      const distanceKm = segmentDistance / 1000;
      const segmentEnergyCost = distanceKm * config.baseCostPerKm;
      
      if (prevElevation !== null && elevation > prevElevation) {
        const ascentM = elevation - prevElevation;
        cumulativeEnergyCost += segmentEnergyCost + (ascentM * config.ascentFactor);
      } else {
        cumulativeEnergyCost += segmentEnergyCost;
      }

      profile.push({
        distance: cumulativeDistance,
        lat: point.lat,
        lng: point.lng,
        elevation,
        slope,
        cumulativeAscent,
        cumulativeEnergyCost: Math.min(100, cumulativeEnergyCost), // 归一化到0-100
      });

      prevElevation = elevation;
    }

    return profile;
  }

  /**
   * 识别过陡段
   */
  private identifySteepSections(
    profile: ElevationProfilePoint[],
    threshold: number,
    minLength: number
  ): SteepSection[] {
    const sections: SteepSection[] = [];
    let currentSection: {
      startIndex: number;
      startDistance: number;
      slopes: number[];
    } | null = null;

    for (let i = 1; i < profile.length; i++) {
      const slope = Math.abs(profile[i].slope);

      if (slope >= threshold) {
        // 进入或继续陡坡段
        if (!currentSection) {
          currentSection = {
            startIndex: i - 1,
            startDistance: profile[i - 1].distance,
            slopes: [slope],
          };
        } else {
          currentSection.slopes.push(slope);
        }
      } else {
        // 退出陡坡段
        if (currentSection) {
          const length = profile[i - 1].distance - currentSection.startDistance;
          if (length >= minLength) {
            const avgSlope = currentSection.slopes.reduce((sum, s) => sum + s, 0) / currentSection.slopes.length;
            const maxSlope = Math.max(...currentSection.slopes);
            const totalAscent = profile[i - 1].cumulativeAscent - profile[currentSection.startIndex].cumulativeAscent;

            // 确定严重程度
            let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
            if (avgSlope >= 25 || maxSlope >= 30) {
              severity = 'HIGH';
            } else if (avgSlope >= 20 || maxSlope >= 25) {
              severity = 'MEDIUM';
            }

            sections.push({
              startDistance: currentSection.startDistance,
              endDistance: profile[i - 1].distance,
              startIndex: currentSection.startIndex,
              endIndex: i - 1,
              avgSlope: Math.round(avgSlope * 100) / 100,
              maxSlope: Math.round(maxSlope * 100) / 100,
              length: Math.round(length),
              totalAscent: Math.round(totalAscent),
              severity,
            });
          }
          currentSection = null;
        }
      }
    }

    // 处理最后一个段（如果路线以陡坡结束）
    if (currentSection) {
      const i = profile.length - 1;
      const length = profile[i].distance - currentSection.startDistance;
      if (length >= minLength) {
        const avgSlope = currentSection.slopes.reduce((sum, s) => sum + s, 0) / currentSection.slopes.length;
        const maxSlope = Math.max(...currentSection.slopes);
        const totalAscent = profile[i].cumulativeAscent - profile[currentSection.startIndex].cumulativeAscent;

        let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        if (avgSlope >= 25 || maxSlope >= 30) {
          severity = 'HIGH';
        } else if (avgSlope >= 20 || maxSlope >= 25) {
          severity = 'MEDIUM';
        }

        sections.push({
          startDistance: currentSection.startDistance,
          endDistance: profile[i].distance,
          startIndex: currentSection.startIndex,
          endIndex: i,
          avgSlope: Math.round(avgSlope * 100) / 100,
          maxSlope: Math.round(maxSlope * 100) / 100,
          length: Math.round(length),
          totalAscent: Math.round(totalAscent),
          severity,
        });
      }
    }

    return sections;
  }

  /**
   * 识别体力断点
   */
  private identifyEnergyBreakpoints(
    profile: ElevationProfilePoint[],
    threshold: number
  ): EnergyBreakpoint[] {
    const breakpoints: EnergyBreakpoint[] = [];
    let lastBreakpointIndex = -1;

    for (let i = 1; i < profile.length; i++) {
      const energyCost = profile[i].cumulativeEnergyCost;

      // 如果累计体力消耗超过阈值，且距离上一个断点足够远（至少1公里）
      if (energyCost >= threshold) {
        const distanceSinceLastBreakpoint = i > lastBreakpointIndex
          ? profile[i].distance - (lastBreakpointIndex >= 0 ? profile[lastBreakpointIndex].distance : 0)
          : Infinity;

        if (distanceSinceLastBreakpoint >= 1000) {
          // 计算建议休息时长（基于体力消耗）
          const restDuration = Math.min(60, Math.max(10, (energyCost - threshold) * 2));

          breakpoints.push({
            distance: profile[i].distance,
            index: i,
            cumulativeEnergyCost: Math.round(energyCost * 100) / 100,
            suggestedRestDuration: Math.round(restDuration),
            reason: `累计体力消耗达到 ${energyCost.toFixed(1)}，超过阈值 ${threshold}`,
          });

          lastBreakpointIndex = i;
        }
      }
    }

    return breakpoints;
  }

  /**
   * 识别强制休息点
   */
  private identifyMandatoryRestPoints(
    profile: ElevationProfilePoint[],
    highAltitudeThreshold: number,
    consecutiveAscentThreshold: number
  ): MandatoryRestPoint[] {
    const restPoints: MandatoryRestPoint[] = [];
    let consecutiveHighAltitudeCount = 0;
    let consecutiveAscentStartIndex = -1;
    let consecutiveAscentStartElevation = 0;

    for (let i = 0; i < profile.length; i++) {
      const point = profile[i];
      const reasons: string[] = [];
      let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      let suggestedRestDuration = 15; // 默认15分钟

      // 检查高海拔
      if (point.elevation >= highAltitudeThreshold) {
        consecutiveHighAltitudeCount++;
        if (consecutiveHighAltitudeCount >= 3) { // 连续3个点（约300米）高海拔
          reasons.push(`连续高海拔（${point.elevation.toFixed(0)}m，超过${highAltitudeThreshold}m）`);
          severity = point.elevation >= 4000 ? 'HIGH' : point.elevation >= 3500 ? 'MEDIUM' : 'LOW';
          suggestedRestDuration = point.elevation >= 4000 ? 30 : point.elevation >= 3500 ? 20 : 15;
        }
      } else {
        consecutiveHighAltitudeCount = 0;
      }

      // 检查连续上升
      if (i > 0) {
        const prevPoint = profile[i - 1];
        if (point.elevation > prevPoint.elevation) {
          if (consecutiveAscentStartIndex < 0) {
            consecutiveAscentStartIndex = i - 1;
            consecutiveAscentStartElevation = prevPoint.elevation;
          }

          const consecutiveAscent = point.elevation - consecutiveAscentStartElevation;
          if (consecutiveAscent >= consecutiveAscentThreshold) {
            reasons.push(`连续上升${consecutiveAscent.toFixed(0)}m（超过${consecutiveAscentThreshold}m）`);
            severity = consecutiveAscent >= 2000 ? 'HIGH' : consecutiveAscent >= 1500 ? 'MEDIUM' : 'LOW';
            suggestedRestDuration = consecutiveAscent >= 2000 ? 45 : consecutiveAscent >= 1500 ? 30 : 20;
            consecutiveAscentStartIndex = -1; // 重置
          }
        } else {
          consecutiveAscentStartIndex = -1;
        }
      }

      // 如果有原因，添加休息点
      if (reasons.length > 0) {
        restPoints.push({
          distance: point.distance,
          index: i,
          elevation: point.elevation,
          consecutiveHighAltitudeDays: consecutiveHighAltitudeCount >= 3 ? consecutiveHighAltitudeCount : undefined,
          consecutiveAscent: consecutiveAscentStartIndex >= 0
            ? point.elevation - consecutiveAscentStartElevation
            : undefined,
          reason: reasons.join('；'),
          suggestedRestDuration,
          severity,
        });
      }
    }

    return restPoints;
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(profile: ElevationProfilePoint[]): {
    totalDistance: number;
    totalAscent: number;
    totalDescent: number;
    maxElevation: number;
    minElevation: number;
    avgSlope: number;
    maxSlope: number;
  } {
    if (profile.length === 0) {
      return {
        totalDistance: 0,
        totalAscent: 0,
        totalDescent: 0,
        maxElevation: 0,
        minElevation: 0,
        avgSlope: 0,
        maxSlope: 0,
      };
    }

    const totalDistance = profile[profile.length - 1].distance;
    const totalAscent = profile[profile.length - 1].cumulativeAscent;
    
    // 计算总下降
    let totalDescent = 0;
    for (let i = 1; i < profile.length; i++) {
      if (profile[i].elevation < profile[i - 1].elevation) {
        totalDescent += profile[i - 1].elevation - profile[i].elevation;
      }
    }

    const elevations = profile.map(p => p.elevation);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);

    const slopes = profile.slice(1).map(p => Math.abs(p.slope));
    const avgSlope = slopes.length > 0
      ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length
      : 0;
    const maxSlope = slopes.length > 0 ? Math.max(...slopes) : 0;

    return {
      totalDistance: Math.round(totalDistance),
      totalAscent: Math.round(totalAscent),
      totalDescent: Math.round(totalDescent),
      maxElevation: Math.round(maxElevation),
      minElevation: Math.round(minElevation),
      avgSlope: Math.round(avgSlope * 100) / 100,
      maxSlope: Math.round(maxSlope * 100) / 100,
    };
  }

  /**
   * 计算两点间距离（米，使用Haversine公式）
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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
}


