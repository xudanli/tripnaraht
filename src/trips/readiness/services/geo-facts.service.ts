// src/trips/readiness/services/geo-facts.service.ts

/**
 * Geo Facts Service - 统一地理特征服务
 * 
 * 整合河网、山脉、道路网络、海岸线、港口和航线数据，提供统一的地理特征查询接口
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { GeoFactsRiverService, RiverFeatures, Point, Route } from './geo-facts-river.service';
import { GeoFactsMountainService, MountainFeatures } from './geo-facts-mountain.service';
import { GeoFactsRoadService, RoadFeatures } from './geo-facts-road.service';
import { GeoFactsCoastlineService, CoastlineFeatures } from './geo-facts-coastline.service';
import { GeoFactsPortService, PortFeatures } from './geo-facts-port.service';
import { GeoFactsAirlineService, AirlineFeatures } from './geo-facts-airline.service';
import { GeoFactsPOIService, POIFeatures } from './geo-facts-poi.service';
import { GeoFactsCacheService } from './geo-facts-cache.service';
import { PhysicalRealityRetrievalService, PhysicalRealityData } from './physical-reality-retrieval.service';

export interface GeoFeatures {
  /** 河网特征 */
  rivers: RiverFeatures;
  /** 山脉特征 */
  mountains: MountainFeatures;
  /** 道路网络特征 */
  roads: RoadFeatures;
  /** 海岸线特征 */
  coastlines: CoastlineFeatures;
  /** 港口特征 */
  ports: PortFeatures;
  /** 航线特征 */
  airlines: AirlineFeatures;
  /** POI 特征 */
  pois: POIFeatures;
  /** Physical Reality 数据（道路状态、渡轮时刻表、天气窗口） */
  physicalReality?: PhysicalRealityData;
  /** 综合地形复杂度（结合河网和山脉） */
  terrainComplexity: number;
  /** 综合风险评分（0-1） */
  riskScore: number;
  /** 交通便利性评分（0-1，基于道路网络、港口和航线） */
  accessibilityScore: number;
}

@Injectable()
export class GeoFactsService {
  private readonly logger = new Logger(GeoFactsService.name);

  constructor(
    private readonly riverService: GeoFactsRiverService,
    private readonly mountainService: GeoFactsMountainService,
    private readonly roadService: GeoFactsRoadService,
    private readonly coastlineService: GeoFactsCoastlineService,
    private readonly portService: GeoFactsPortService,
    private readonly airlineService: GeoFactsAirlineService,
    private readonly poiService: GeoFactsPOIService,
    @Optional() private readonly cacheService?: GeoFactsCacheService,
    @Optional() private readonly physicalRealityService?: PhysicalRealityRetrievalService
  ) {}

  /**
   * 获取点位的综合地理特征（带缓存）
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
      nearPortThresholdKm?: number;
      nearAirportThresholdKm?: number;
      poiRadiusKm?: number;
      pickupLimit?: number;
      useCache?: boolean; // 是否使用缓存（默认 true）
      month?: number; // 月份（1-12），用于季节性评估
    }
  ): Promise<GeoFeatures> {
    // 检查缓存
    if (options?.useCache !== false && this.cacheService) {
      const cached = await this.cacheService.get(lat, lng, options);
      if (cached) {
        this.logger.debug(`Cache hit for point (${lat}, ${lng})`);
        return cached;
      }
    }

    this.logger.debug(`Fetching geo features for point (${lat}, ${lng})`);

    // 识别区域（用于检索Physical Reality数据）
    const region = this.identifyRegion(lat, lng);

    const [rivers, mountains, roads, coastlines, ports, airlines, pois, physicalReality] = await Promise.all([
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
      this.portService.getPortFeaturesForPoint(
        lat,
        lng,
        options?.nearPortThresholdKm,
        options?.densityBufferKm
      ),
      this.airlineService.getAirlineFeaturesForPoint(
        lat,
        lng,
        options?.nearAirportThresholdKm,
        options?.densityBufferKm
      ),
      this.poiService.getPOIFeaturesForPoint(
        lat,
        lng,
        options?.poiRadiusKm,
        options?.pickupLimit
      ),
      // 检索Physical Reality数据（如果服务可用）
      this.physicalRealityService
        ? this.physicalRealityService.retrievePhysicalRealityData(region, {
            lat,
            lng,
            month: options?.month,
            limit: 10,
          }).catch((error) => {
            this.logger.warn(`Failed to retrieve Physical Reality data: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
          })
        : Promise.resolve(undefined),
    ]);

    const result: GeoFeatures = {
      rivers,
      mountains,
      roads,
      coastlines,
      ports,
      airlines,
      pois,
      physicalReality,
      terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
      riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines, physicalReality, options?.month),
      accessibilityScore: this.calculateAccessibilityScore(roads, ports, airlines, physicalReality, options?.month),
    };

    // 保存到缓存
    if (options?.useCache !== false && this.cacheService) {
      await this.cacheService.set(lat, lng, result, options);
    }

    return result;
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
      nearPortThresholdKm?: number;
      nearAirportThresholdKm?: number;
      poiRadiusKm?: number;
      pickupLimit?: number;
    }
  ): Promise<GeoFeatures> {
    const [rivers, mountains, roads, coastlines, ports, airlines, pois] = await Promise.all([
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
      this.portService.getPortFeaturesForRoute(
        route,
        options?.nearPortThresholdKm,
        options?.densityBufferKm
      ),
      this.airlineService.getAirlineFeaturesForRoute(
        route,
        options?.nearAirportThresholdKm,
        options?.densityBufferKm
      ),
      this.poiService.getPOIFeaturesForRoute(
        route,
        options?.poiRadiusKm,
        options?.pickupLimit
      ),
    ]);

    return {
      rivers,
      mountains,
      roads,
      coastlines,
      ports,
      airlines,
      pois,
      terrainComplexity: this.calculateTerrainComplexity(rivers, mountains),
      riskScore: this.calculateRiskScore(rivers, mountains, roads, coastlines, undefined, undefined),
      accessibilityScore: this.calculateAccessibilityScore(roads, ports, airlines, undefined, undefined),
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
   * 识别区域（根据坐标）
   */
  private identifyRegion(lat: number, lng: number): string {
    // 简化的区域识别逻辑（可以根据需要扩展）
    // 冰岛: 63-67°N, -25--13°W
    if (lat >= 63 && lat <= 67 && lng >= -25 && lng <= -13) return 'iceland';
    // 格陵兰: 59-84°N, -75--10°W
    if (lat >= 59 && lat <= 84 && lng >= -75 && lng <= -10) return 'greenland';
    // 阿尔卑斯: 43-48°N, 5-16°E
    if (lat >= 43 && lat <= 48 && lng >= 5 && lng <= 16) return 'alps';
    // 新西兰南岛: -47--40°N, 166-175°E
    if (lat >= -47 && lat <= -40 && lng >= 166 && lng <= 175) return 'new-zealand-south-island';
    // 阿根廷: -56--22°N, -73--53°W
    if (lat >= -56 && lat <= -22 && lng >= -73 && lng <= -53) return 'argentina';
    // 法罗群岛: 61-63°N, -8--6°W
    if (lat >= 61 && lat <= 63 && lng >= -8 && lng <= -6) return 'faroe-islands';
    // 罗弗敦群岛: 67-69°N, 12-16°E
    if (lat >= 67 && lat <= 69 && lng >= 12 && lng <= 16) return 'lofoten';
    // 斯瓦尔巴: 74-81°N, 10-35°E
    if (lat >= 74 && lat <= 81 && lng >= 10 && lng <= 35) return 'svalbard';
    
    return 'unknown';
  }

  /**
   * 计算综合风险评分（0-1）
   * 
   * 基于河网、山脉和道路特征评估风险
   * 增强：考虑Physical Reality数据（天气窗口、极端事件）
   */
  private calculateRiskScore(
    rivers: RiverFeatures,
    mountains: MountainFeatures,
    roads: RoadFeatures,
    coastlines: CoastlineFeatures,
    physicalReality?: PhysicalRealityData,
    month?: number
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

    // Physical Reality数据增强风险评分
    if (physicalReality) {
      // 考虑天气窗口中的极端事件
      physicalReality.weatherWindows?.forEach((window) => {
        window.extremeEvents?.forEach((event) => {
          // 如果指定了月份，只考虑该月份的极端事件
          if (month && event.typicalMonths && !event.typicalMonths.includes(month)) {
            return;
          }
          
          if (event.severity === 'extreme' || event.severity === 'very_high') {
            risk += 0.05; // 极端天气事件增加风险
          } else if (event.severity === 'high') {
            risk += 0.03; // 高风险事件增加风险
          }
        });
      });

      // 考虑季节性风险等级（如果指定了月份）
      if (month) {
        physicalReality.weatherWindows?.forEach((window) => {
          const riskLevel = window.riskLevels?.find((r) => r.month === month);
          if (riskLevel) {
            if (riskLevel.riskLevel === 'extreme' || riskLevel.riskLevel === 'very_high') {
              risk += 0.08; // 极端风险等级
            } else if (riskLevel.riskLevel === 'high') {
              risk += 0.05; // 高风险等级
            } else if (riskLevel.riskLevel === 'medium') {
              risk += 0.03; // 中等风险等级
            }
          }
        });
      }

      // 考虑道路状态（关闭或限制 = 风险高）
      physicalReality.roadStates?.forEach((road) => {
        // 如果指定了月份，检查季节性封路
        if (month && road.status === 'SEASONAL') {
          if (road.seasonOpenFrom && road.seasonOpenTo) {
            // 检查当前月份是否在开放季节内
            const isOpen = month >= road.seasonOpenFrom && month <= road.seasonOpenTo;
            if (!isOpen) {
              risk += 0.04; // 季节性封路期间增加风险
            }
          }
        } else if (road.status === 'CLOSED') {
          risk += 0.03; // 道路关闭增加风险
        } else if (road.status === 'RESTRICTED') {
          risk += 0.02; // 道路限制增加风险
        }
      });
    }

    return Math.min(Math.round(risk * 100) / 100, 1.0);
  }

  /**
   * 计算交通便利性评分（0-1）
   * 
   * 结合道路网络、港口和航线可达性
   * 增强：考虑Physical Reality数据（道路状态、渡轮状态、天气窗口、季节性因素）
   */
  private calculateAccessibilityScore(
    roads: RoadFeatures,
    ports: PortFeatures,
    airlines: AirlineFeatures,
    physicalReality?: PhysicalRealityData,
    month?: number
  ): number {
    // 道路可达性权重：0.5
    // 港口可达性权重：0.2（靠近港口 = 更多交通选择）
    // 航线可达性权重：0.3（靠近机场 = 更多交通选择）
    const roadWeight = 0.5;
    const portWeight = 0.2;
    const airlineWeight = 0.3;

    // 港口可达性：靠近港口（10km内）= 1.0，否则 = 0.5 * portDensityScore
    const portAccessibility = ports.nearPort 
      ? 1.0 
      : Math.min(ports.portDensityScore * 0.5, 0.5);

    // 航线可达性：靠近机场（20km内）= 1.0，否则 = 0.5 * airlineDensityScore
    const airlineAccessibility = airlines.nearAirport 
      ? 1.0 
      : Math.min(airlines.airlineDensityScore * 0.5, 0.5);

    let score = 
      roads.roadAccessibility * roadWeight +
      portAccessibility * portWeight +
      airlineAccessibility * airlineWeight;

    // Physical Reality数据增强可达性评分
    if (physicalReality) {
      // 考虑道路状态（开放道路提升可达性，关闭道路降低可达性）
      const roadStatesCount = physicalReality.roadStates?.length || 0;
      let accessibleRoadsCount = 0;
      
      if (roadStatesCount > 0) {
        accessibleRoadsCount = physicalReality.roadStates.filter((r) => {
          if (r.status === 'OPEN') {
            return true;
          }
          // 如果是季节性道路且指定了月份，检查是否在开放季节
          if (r.status === 'SEASONAL' && month && r.seasonOpenFrom && r.seasonOpenTo) {
            return month >= r.seasonOpenFrom && month <= r.seasonOpenTo;
          }
          return false;
        }).length;
        
        const roadStateRatio = accessibleRoadsCount / roadStatesCount;
        score = score * 0.8 + roadStateRatio * 0.2; // 道路状态影响20%
      }

      // 考虑渡轮状态（运行中的渡轮提升可达性）
      const ferryStatesCount = physicalReality.ferryStates?.length || 0;
      let accessibleFerriesCount = 0;
      
      if (ferryStatesCount > 0 && ports.nearPort) {
        accessibleFerriesCount = physicalReality.ferryStates.filter((f) => {
          if (f.status === 'RUNNING') {
            return true;
          }
          // 如果是季节性渡轮且指定了月份，检查是否在运行季节
          if (f.status === 'SEASONAL' && month && f.seasonOpenFrom && f.seasonOpenTo) {
            return month >= f.seasonOpenFrom && month <= f.seasonOpenTo;
          }
          return false;
        }).length;
        
        const ferryStateRatio = accessibleFerriesCount / ferryStatesCount;
        score = score * 0.9 + ferryStateRatio * 0.1; // 渡轮状态影响10%（仅在靠近港口时）
      }

      // 考虑天气窗口（最佳窗口提升可达性）
      if (month) {
        // 如果指定了月份，检查是否在最佳窗口内
        const isInBestWindow = physicalReality.weatherWindows?.some((window) => {
          return window.bestWindows?.some((bestWindow) => {
            return bestWindow.months.includes(month);
          });
        });
        
        if (isInBestWindow) {
          // 在最佳窗口内，提升可达性
          score = Math.min(score * 1.1, 1.0);
        } else {
          // 不在最佳窗口内，检查风险等级
          const hasHighRisk = physicalReality.weatherWindows?.some((window) => {
            const riskLevel = window.riskLevels?.find((r) => r.month === month);
            return riskLevel && (riskLevel.riskLevel === 'high' || riskLevel.riskLevel === 'very_high' || riskLevel.riskLevel === 'extreme');
          });
          
          if (hasHighRisk) {
            // 高风险月份，降低可达性
            score = score * 0.9;
          }
        }
      } else {
        // 未指定月份，如果有最佳窗口，轻微提升可达性
        const bestWindows = physicalReality.weatherWindows?.flatMap(
          (w) => w.bestWindows || []
        ) || [];
        if (bestWindows.length > 0) {
          score = Math.min(score * 1.05, 1.0);
        }
      }
    }

    return Math.min(Math.round(score * 100) / 100, 1.0);
  }
}

