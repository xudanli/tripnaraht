// src/trips/readiness/services/geo-facts.service.ts

/**
 * Geo Facts Service - 统一地理特征服务
 * 
 * 整合河网、山脉和道路网络数据，提供统一的地理特征查询接口
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeoFactsRiverService, RiverFeatures, Point, Route } from './geo-facts-river.service';
import { GeoFactsMountainService, MountainFeatures } from './geo-facts-mountain.service';
import { GeoFactsRoadService, RoadFeatures } from './geo-facts-road.service';
import { GeoFactsCoastlineService, CoastlineFeatures } from './geo-facts-coastline.service';

export interface GeoFeatures {
  /** 河网特征 */
  rivers: RiverFeatures;
  /** 山脉特征 */
  mountains: MountainFeatures;
  /** 道路网络特征 */
  roads: RoadFeatures;
  /** 海岸线特征 */
  coastlines: CoastlineFeatures;
  /** 综合地形复杂度（结合河网和山脉） */
  terrainComplexity: number;
  /** 综合风险评分（0-1） */
  riskScore: number;
  /** 交通便利性评分（0-1，基于道路网络） */
  accessibilityScore: number;
}

@Injectable()
export class GeoFactsService {
  private readonly logger = new Logger(GeoFactsService.name);

  constructor(
    private readonly riverService: GeoFactsRiverService,
    private readonly mountainService: GeoFactsMountainService,
    private readonly roadService: GeoFactsRoadService,
    private readonly coastlineService: GeoFactsCoastlineService
  ) {}

  /**
   * 获取点位的综合地理特征
   */
  async getGeoFeaturesForPoint(
    lat: number,
    lng: number,
    options?: {
      nearRiverThresholdM?: number;
      densityBufferKm?: number;
      nearWaterThresholdM?: number;
      nearRoadThresholdM?: number;
      nearCoastlineThresholdKm?: number;
      coastalAreaThresholdKm?: number;
    }
  ): Promise<GeoFeatures> {
    const [rivers, mountains, roads, coastlines] = await Promise.all([
      this.riverService.getRiverFeaturesForPoint(
        lat,
        lng,
        options?.nearRiverThresholdM,
        options?.densityBufferKm,
        options?.nearWaterThresholdM
      ),
      this.mountainService.getMountainFeaturesForPoint(
        lat,
        lng,
        options?.densityBufferKm
      ),
      this.roadService.getRoadFeaturesForPoint(
        lat,
        lng,
        options?.nearRoadThresholdM,
        options?.densityBufferKm
      ),
      this.coastlineService.getCoastlineFeaturesForPoint(
        lat,
        lng,
        options?.nearCoastlineThresholdKm,
        options?.coastalAreaThresholdKm,
        options?.densityBufferKm
      ),
    ]);

    return {
      rivers,
      mountains,
      roads,
      coastlines,
      terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
      riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines),
      accessibilityScore: roads.roadAccessibility,
    };
  }

  /**
   * 获取路线的综合地理特征
   */
  async getGeoFeaturesForRoute(
    route: Route,
    options?: {
      nearRiverThresholdM?: number;
      densityBufferKm?: number;
      nearRoadThresholdM?: number;
      nearCoastlineThresholdKm?: number;
      coastalAreaThresholdKm?: number;
    }
  ): Promise<GeoFeatures> {
    const [rivers, mountains, roads, coastlines] = await Promise.all([
      this.riverService.getRiverFeaturesForRoute(
        route,
        options?.nearRiverThresholdM,
        options?.densityBufferKm
      ),
      this.mountainService.getMountainFeaturesForRoute(
        route,
        options?.densityBufferKm
      ),
      this.roadService.getRoadFeaturesForRoute(
        route,
        options?.nearRoadThresholdM,
        options?.densityBufferKm
      ),
      this.coastlineService.getCoastlineFeaturesForRoute(
        route,
        options?.nearCoastlineThresholdKm,
        options?.coastalAreaThresholdKm,
        options?.densityBufferKm
      ),
    ]);

    return {
      rivers,
      mountains,
      roads,
      coastlines,
      terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
      riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines),
      accessibilityScore: roads.roadAccessibility,
    };
  }

  /**
   * 计算综合地形复杂度（0-1）
   * 
   * 结合河网密度和山脉复杂度
   */
  private calculateTerrainComplexity(
    rivers: RiverFeatures,
    mountains: MountainFeatures
  ): number {
    // 河网密度权重：0.3
    // 山脉复杂度权重：0.4
    // 山脉密度权重：0.3
    const riverWeight = 0.3;
    const mountainComplexityWeight = 0.4;
    const mountainDensityWeight = 0.3;

    const score =
      rivers.riverDensityScore * riverWeight +
      mountains.terrainComplexity * mountainComplexityWeight +
      mountains.mountainDensityScore * mountainDensityWeight;

    return Math.min(Math.round(score * 100) / 100, 1.0);
  }

  /**
   * 计算综合风险评分（0-1）
   * 
   * 基于河网、山脉和道路特征评估风险
   */
  private calculateRiskScore(
    rivers: RiverFeatures,
    mountains: MountainFeatures,
    roads: RoadFeatures,
    coastlines: CoastlineFeatures
  ): number {
    let risk = 0;

    // 河网风险因子
    if (rivers.nearRiver) {
      risk += 0.12; // 靠近河网：涨水/湿滑风险
    }
    if (rivers.riverCrossingCount > 5) {
      risk += 0.10; // 高穿越次数：复杂路线风险
    }
    if (rivers.riverDensityScore > 0.7) {
      risk += 0.06; // 高河网密度：湿滑/蚊虫风险
    }

    // 山脉风险因子
    if (mountains.inMountain) {
      risk += 0.12; // 在山脉内：地形复杂/天气变化风险
    }
    if (mountains.mountainElevationMax && mountains.mountainElevationMax > 3000) {
      risk += 0.10; // 高海拔：高反/低温风险
    }
    if (mountains.terrainComplexity > 0.7) {
      risk += 0.06; // 高地形复杂度：迷路/滑倒风险
    }

    // 道路风险因子（道路少 = 风险高）
    if (!roads.nearRoad || roads.roadAccessibility < 0.3) {
      risk += 0.08; // 远离道路：救援困难/信号差风险
    }

    // 海岸线风险因子
    if (coastlines.nearCoastline) {
      risk += 0.08; // 靠近海岸线：海浪/风暴风险
    }
    // 海岸山脉（海岸线 + 山脉）风险更高
    if (coastlines.nearCoastline && mountains.inMountain) {
      risk += 0.06; // 海岸山脉：悬崖/落石风险
    }

    return Math.min(Math.round(risk * 100) / 100, 1.0);
  }
}

