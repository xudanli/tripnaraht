// src/trips/readiness/services/terrain-facts.service.ts

/**
 * Terrain Facts Service
 * 
 * 整合DEM数据，生成标准化的TerrainFacts结构
 */

import { Injectable, Logger } from '@nestjs/common';
import { DEMElevationService } from './dem-elevation.service';
import { DEMEffortMetadataService, RoutePoint } from './dem-effort-metadata.service';
import { TerrainFacts, TerrainStats, EffortLevel, RouteSegmentId } from '../types/terrain-facts.types';
import { DEFAULT_TERRAIN_POLICY, EffortLevelMapping } from '../config/terrain-policy.config';
import * as crypto from 'crypto';

export interface LineString {
  type: 'LineString';
  coordinates: Array<[number, number]>; // [lng, lat]
}

@Injectable()
export class TerrainFactsService {
  private readonly logger = new Logger(TerrainFactsService.name);

  constructor(
    private readonly demElevationService: DEMElevationService,
    private readonly demEffortMetadataService: DEMEffortMetadataService,
  ) {}

  /**
   * 为路线段生成TerrainFacts
   */
  async getTerrainFactsForSegment(
    segmentId: RouteSegmentId,
    lineString: LineString,
    stepM: number = 100
  ): Promise<TerrainFacts> {
    // 1. 生成海拔剖面
    const profile = await this.profileLine(lineString, stepM);
    
    // 2. 计算地形统计
    const terrainStats = await this.computeTerrainStats(profile);
    
    // 3. 推断数据源
    const source = await this.inferSource(lineString);
    
    // 4. 生成剖面ID（用于缓存）
    const elevationProfileId = this.generateProfileId(lineString, stepM);
    
    // 5. 映射体力等级
    const effortLevel = this.mapEffortLevel(terrainStats.effortScore, DEFAULT_TERRAIN_POLICY.effortLevelMapping);
    
    // 6. 生成风险标志（由TerrainRiskService处理，这里先返回空数组）
    const riskFlags: TerrainFacts['riskFlags'] = [];
    
    return {
      terrainStats,
      effortLevel,
      riskFlags,
      elevationProfileId,
      source,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * 生成路线海拔剖面
   */
  private async profileLine(
    lineString: LineString,
    stepM: number
  ): Promise<Array<{ distance: number; lat: number; lng: number; elevationM: number }>> {
    const coordinates = lineString.coordinates;
    if (coordinates.length < 2) {
      throw new Error('LineString must have at least 2 coordinates');
    }

    const profile: Array<{ distance: number; lat: number; lng: number; elevationM: number }> = [];
    let totalDistance = 0;

    // 直接使用原始点生成剖面（简化实现）
    for (let i = 0; i < coordinates.length; i++) {
      const [lng, lat] = coordinates[i];
      const elevation = await this.demElevationService.getElevation(lat, lng);
      
      if (i > 0) {
        const [prevLng, prevLat] = coordinates[i - 1];
        totalDistance += this.calculateDistance(prevLat, prevLng, lat, lng);
      }
      
      profile.push({
        distance: totalDistance,
        lat,
        lng,
        elevationM: elevation ?? 0,
      });
    }

    return profile;
  }

  /**
   * 计算地形统计
   */
  private async computeTerrainStats(
    profile: Array<{ distance: number; lat: number; lng: number; elevationM: number }>
  ): Promise<TerrainStats> {
    if (profile.length < 2) {
      throw new Error('Profile must have at least 2 points');
    }

    const elevations = profile.map(p => p.elevationM);
    const minElevationM = Math.min(...elevations);
    const maxElevationM = Math.max(...elevations);
    const totalDistanceM = profile[profile.length - 1].distance;

    // 计算累计爬升和下降
    let totalAscentM = 0;
    let totalDescentM = 0;
    const slopes: number[] = [];

    for (let i = 1; i < profile.length; i++) {
      const prev = profile[i - 1];
      const curr = profile[i];
      const distance = curr.distance - prev.distance;
      const elevationChange = curr.elevationM - prev.elevationM;

      if (elevationChange > 0) {
        totalAscentM += elevationChange;
      } else {
        totalDescentM += Math.abs(elevationChange);
      }

      if (distance > 0) {
        const slope = (elevationChange / distance) * 100;
        slopes.push(Math.abs(slope));
      }
    }

    const maxSlopePct = slopes.length > 0 ? Math.max(...slopes) : 0;
    const avgSlopePct = slopes.length > 0 ? slopes.reduce((sum, s) => sum + s, 0) / slopes.length : 0;

    // 计算体力消耗评分（0-100）
    const distanceScore = Math.min(100, (totalDistanceM / 1000) * 10);
    const ascentScore = Math.min(100, (totalAscentM / 100) * 5);
    const slopeScore = Math.min(100, maxSlopePct * 2);
    const effortScore = Math.min(100, (distanceScore + ascentScore + slopeScore) / 3);

    return {
      minElevationM,
      maxElevationM,
      totalAscentM: Math.round(totalAscentM),
      totalDescentM: Math.round(totalDescentM),
      maxSlopePct: Math.round(maxSlopePct * 10) / 10,
      avgSlopePct: Math.round(avgSlopePct * 10) / 10,
      effortScore: Math.round(effortScore * 10) / 10,
      totalDistanceM: Math.round(totalDistanceM),
    };
  }

  /**
   * 推断数据源
   */
  private async inferSource(lineString: LineString): Promise<'CN_DEM' | 'GLOBAL_DEM'> {
    // 简单判断：如果坐标在中国范围内，优先使用CN_DEM
    const coordinates = lineString.coordinates;
    const avgLat = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
    const avgLng = coordinates.reduce((sum, [lng]) => sum + lng, 0) / coordinates.length;

    // 中国大致范围：纬度18-54，经度73-135
    if (avgLat >= 18 && avgLat <= 54 && avgLng >= 73 && avgLng <= 135) {
      return 'CN_DEM';
    }
    return 'GLOBAL_DEM';
  }

  /**
   * 生成剖面ID（用于缓存）
   */
  private generateProfileId(lineString: LineString, stepM: number): string {
    const coordsStr = JSON.stringify(lineString.coordinates);
    const hash = crypto.createHash('md5').update(coordsStr + stepM).digest('hex');
    return `profile_${hash.substring(0, 16)}`;
  }

  /**
   * 映射体力等级
   */
  private mapEffortLevel(
    effortScore: number,
    mapping: EffortLevelMapping
  ): EffortLevel {
    if (effortScore <= mapping.relaxMax) {
      return 'RELAX';
    } else if (effortScore <= mapping.moderateMax) {
      return 'MODERATE';
    } else if (effortScore < mapping.extremeMin) {
      return 'CHALLENGE';
    } else {
      return 'EXTREME';
    }
  }

  /**
   * 计算两点间距离（米）
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

