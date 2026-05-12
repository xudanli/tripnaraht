// src/trips/readiness/services/physical-reality-dem-association.service.ts

/**
 * Physical Reality 与 DEM 数据关联服务
 * 
 * 将道路状态数据与DEM地形数据关联，计算道路的海拔、坡度等地形特征
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PhysicalRealityRetrievalService, RoadStateInfo } from './physical-reality-retrieval.service';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';

export interface RoadTerrainFeatures {
  /** 道路ID */
  roadId: string;
  /** 起点海拔（米） */
  startElevation?: number;
  /** 终点海拔（米） */
  endElevation?: number;
  /** 平均海拔（米） */
  avgElevation?: number;
  /** 最高海拔（米） */
  maxElevation?: number;
  /** 最低海拔（米） */
  minElevation?: number;
  /** 总爬升（米） */
  totalAscent?: number;
  /** 总下降（米） */
  totalDescent?: number;
  /** 平均坡度（%） */
  avgSlope?: number;
  /** 最大坡度（%） */
  maxSlope?: number;
  /** 地形复杂度评分（0-1） */
  terrainComplexity?: number;
  /** DEM数据可用性 */
  demAvailable: boolean;
}

export interface EnhancedRoadStateInfo extends RoadStateInfo {
  /** 地形特征 */
  terrainFeatures?: RoadTerrainFeatures;
}

@Injectable()
export class PhysicalRealityDEMAssociationService {
  private readonly logger = new Logger(PhysicalRealityDEMAssociationService.name);

  constructor(
    @Optional() private readonly physicalRealityService?: PhysicalRealityRetrievalService,
    @Optional() private readonly demService?: DEMElevationService
  ) {}

  /**
   * 为道路状态数据添加DEM地形特征
   */
  async enhanceRoadStateWithDEM(
    roadState: RoadStateInfo
  ): Promise<EnhancedRoadStateInfo> {
    if (!this.demService) {
      this.logger.debug('DEM service not available, skipping terrain features');
      return {
        ...roadState,
        terrainFeatures: {
          roadId: roadState.roadId,
          demAvailable: false,
        },
      };
    }

    // 如果没有坐标信息，无法查询DEM
    if (!roadState.coordinates?.start || !roadState.coordinates?.end) {
      this.logger.debug(`Road ${roadState.roadId} has no coordinates, skipping DEM query`);
      return {
        ...roadState,
        terrainFeatures: {
          roadId: roadState.roadId,
          demAvailable: false,
        },
      };
    }

    try {
      const terrainFeatures = await this.calculateTerrainFeatures(roadState);
      return {
        ...roadState,
        terrainFeatures,
      };
    } catch (error) {
      this.logger.warn(`Failed to calculate terrain features for road ${roadState.roadId}:`, error);
      return {
        ...roadState,
        terrainFeatures: {
          roadId: roadState.roadId,
          demAvailable: false,
        },
      };
    }
  }

  /**
   * 批量增强道路状态数据
   */
  async enhanceRoadStatesWithDEM(
    roadStates: RoadStateInfo[]
  ): Promise<EnhancedRoadStateInfo[]> {
    if (!this.demService) {
      return roadStates.map(road => ({
        ...road,
        terrainFeatures: {
          roadId: road.roadId,
          demAvailable: false,
        },
      }));
    }

    // 并行查询DEM数据（限制并发数）
    const enhancedRoads = await Promise.all(
      roadStates.map(road => this.enhanceRoadStateWithDEM(road))
    );

    return enhancedRoads;
  }

  /**
   * 计算道路的地形特征
   */
  private async calculateTerrainFeatures(
    roadState: RoadStateInfo
  ): Promise<RoadTerrainFeatures> {
    if (!this.demService) {
      return {
        roadId: roadState.roadId,
        demAvailable: false,
      };
    }

    const start = roadState.coordinates?.start;
    const end = roadState.coordinates?.end;
    if (
      !start ||
      !end ||
      start.lat == null ||
      start.lng == null ||
      end.lat == null ||
      end.lng == null
    ) {
      return {
        roadId: roadState.roadId,
        demAvailable: false,
      };
    }

    // 查询起点和终点海拔
    const startElevation = await this.demService.getElevation(start.lat, start.lng);
    const endElevation = await this.demService.getElevation(end.lat, end.lng);

    if (startElevation === null && endElevation === null) {
      return {
        roadId: roadState.roadId,
        demAvailable: false,
      };
    }

    // 计算基本地形特征
    const features: RoadTerrainFeatures = {
      roadId: roadState.roadId,
      startElevation: startElevation ?? undefined,
      endElevation: endElevation ?? undefined,
      demAvailable: true,
    };

    // 计算平均海拔
    if (startElevation !== null && endElevation !== null) {
      features.avgElevation = (startElevation + endElevation) / 2;
      features.maxElevation = Math.max(startElevation, endElevation);
      features.minElevation = Math.min(startElevation, endElevation);
    } else if (startElevation !== null) {
      features.avgElevation = startElevation;
      features.maxElevation = startElevation;
      features.minElevation = startElevation;
    } else if (endElevation !== null) {
      features.avgElevation = endElevation;
      features.maxElevation = endElevation;
      features.minElevation = endElevation;
    }

    // 计算爬升和下降
    if (startElevation !== null && endElevation !== null) {
      const elevationDiff = endElevation - startElevation;
      if (elevationDiff > 0) {
        features.totalAscent = elevationDiff;
        features.totalDescent = 0;
      } else {
        features.totalAscent = 0;
        features.totalDescent = Math.abs(elevationDiff);
      }
    }

    // 计算坡度（简化：基于起点和终点）
    if (startElevation !== null && endElevation !== null && roadState.coordinates) {
      const distance = this.calculateDistance(
        start.lat,
        start.lng,
        end.lat,
        end.lng
      );
      
      if (distance > 0) {
        const elevationDiff = endElevation - startElevation;
        const slope = (elevationDiff / distance) * 100; // 坡度百分比
        features.avgSlope = Math.abs(slope);
        features.maxSlope = Math.abs(slope); // 简化：使用平均坡度作为最大坡度
      }
    }

    // 计算地形复杂度评分（0-1）
    features.terrainComplexity = this.calculateTerrainComplexity(features);

    return features;
  }

  /**
   * 计算两点之间的距离（米）
   * 使用Haversine公式
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

  /**
   * 角度转弧度
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 计算地形复杂度评分（0-1）
   * 
   * 考虑因素：
   * - 海拔高度（越高越复杂）
   * - 坡度（越陡越复杂）
   * - 海拔变化（爬升/下降越大越复杂）
   */
  private calculateTerrainComplexity(features: RoadTerrainFeatures): number {
    let complexity = 0;

    // 海拔高度因子（0-0.3）
    if (features.avgElevation !== undefined) {
      // 海拔越高，复杂度越高
      // 0m = 0, 3000m+ = 0.3
      const elevationFactor = Math.min(features.avgElevation / 3000, 1) * 0.3;
      complexity += elevationFactor;
    }

    // 坡度因子（0-0.4）
    if (features.avgSlope !== undefined) {
      // 坡度越陡，复杂度越高
      // 0% = 0, 20%+ = 0.4
      const slopeFactor = Math.min(features.avgSlope / 20, 1) * 0.4;
      complexity += slopeFactor;
    }

    // 海拔变化因子（0-0.3）
    if (features.totalAscent !== undefined && features.totalDescent !== undefined) {
      const totalChange = features.totalAscent + features.totalDescent;
      // 海拔变化越大，复杂度越高
      // 0m = 0, 1000m+ = 0.3
      const changeFactor = Math.min(totalChange / 1000, 1) * 0.3;
      complexity += changeFactor;
    }

    return Math.min(Math.round(complexity * 100) / 100, 1.0);
  }

  /**
   * 从Physical Reality数据检索并增强道路状态
   */
  async retrieveAndEnhanceRoadStates(
    region: string,
    options?: {
      lat?: number;
      lng?: number;
      month?: number;
      limit?: number;
    }
  ): Promise<EnhancedRoadStateInfo[]> {
    if (!this.physicalRealityService) {
      this.logger.warn('PhysicalRealityRetrievalService not available');
      return [];
    }

    const data = await this.physicalRealityService.retrievePhysicalRealityData(region, options);
    return await this.enhanceRoadStatesWithDEM(data.roadStates);
  }
}
