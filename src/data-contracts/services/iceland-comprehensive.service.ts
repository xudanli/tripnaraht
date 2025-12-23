// src/data-contracts/services/iceland-comprehensive.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { DataSourceRouterService } from './data-source-router.service';
import { IcelandSafetyAdapter } from '../adapters/iceland-safety.adapter';
import { IcelandFRoadService } from './iceland-froad.service';
import { IcelandAuroraAdapter } from '../adapters/iceland-aurora.adapter';
import { RoadStatusQuery, ExtendedRoadStatus } from '../interfaces/road-status.interface';
import { WeatherQuery, ExtendedWeatherData } from '../interfaces/weather.interface';
import { 
  IcelandSafetyAlert, 
  RouteRiskAssessment, 
  CarRentalInsurance,
  FRoadInfo 
} from '../interfaces/iceland-specific.interface';
import { RiskCalculator } from '../../common/utils/risk-calculator.util';

/**
 * 冰岛综合服务
 * 
 * 整合所有冰岛特定数据源：
 * - 路况（Road.is）
 * - 天气（Vedur.is）
 * - 安全警报（SafeTravel.is）
 * - F-Road 评估
 * - 极光监测
 */
@Injectable()
export class IcelandComprehensiveService {
  private readonly logger = new Logger(IcelandComprehensiveService.name);

  constructor(
    private readonly router: DataSourceRouterService,
    private readonly safetyAdapter: IcelandSafetyAdapter,
    private readonly fRoadService: IcelandFRoadService,
    private readonly auroraAdapter: IcelandAuroraAdapter,
  ) {}

  /**
   * 获取完整的冰岛路况信息（包含 F-Road、河流渡口等）
   */
  async getComprehensiveRoadStatus(query: RoadStatusQuery): Promise<ExtendedRoadStatus> {
    const roadQuery: RoadStatusQuery = {
      ...query,
      includeFRoadInfo: true,
      includeRiverCrossing: true,
    };

    const status = await this.router.getRoadStatus(roadQuery);
    return status as ExtendedRoadStatus;
  }

  /**
   * 获取完整的冰岛天气信息（包含风速、极光等）
   */
  async getComprehensiveWeather(query: WeatherQuery): Promise<ExtendedWeatherData> {
    const weatherQuery: WeatherQuery = {
      ...query,
      includeWindDetails: true,
      includeAuroraInfo: true,
    };

    const weather = await this.router.getWeather(weatherQuery);
    return weather as ExtendedWeatherData;
  }

  /**
   * 获取安全警报
   */
  async getSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]> {
    return this.safetyAdapter.getSafetyAlerts(lat, lng);
  }

  /**
   * 获取关键安全警报
   */
  async getCriticalSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]> {
    return this.safetyAdapter.getCriticalSafetyAlerts(lat, lng);
  }

  /**
   * 评估路径风险（包含 F-Road、保险建议等）
   */
  assessRouteRisk(
    routeSegments: Array<{
      roadNumber?: string;
      roadType?: string;
      isGravel?: boolean;
    }>,
    vehicleType?: '2WD' | '4WD',
    insurance?: CarRentalInsurance[]
  ): RouteRiskAssessment {
    return this.fRoadService.assessRouteRisk(routeSegments, vehicleType, insurance);
  }

  /**
   * 检查车辆是否适合路径
   */
  isVehicleSuitableForRoute(
    vehicleType: '2WD' | '4WD',
    routeSegments: Array<{ roadNumber?: string }>
  ): { suitable: boolean; reason?: string } {
    return this.fRoadService.isVehicleSuitableForRoute(vehicleType, routeSegments);
  }

  /**
   * 获取极光可见性
   */
  async getAuroraVisibility(lat: number, lng: number): Promise<'none' | 'low' | 'moderate' | 'high'> {
    return this.auroraAdapter.calculateAuroraVisibility(lat, lng);
  }

  /**
   * 获取极光预测
   */
  async getAuroraForecast(lat: number, lng: number, hours: number = 24) {
    return this.auroraAdapter.getAuroraForecast(lat, lng, hours);
  }

  /**
   * 获取综合安全评估
   * 
   * 整合路况、天气、安全警报等信息，提供综合安全评估
   */
  async getComprehensiveSafetyAssessment(
    lat: number,
    lng: number,
    routeSegments?: Array<{ roadNumber?: string; roadType?: string; isGravel?: boolean }>
  ): Promise<{
    roadStatus: ExtendedRoadStatus;
    weather: ExtendedWeatherData;
    safetyAlerts: IcelandSafetyAlert[];
    routeRisk?: RouteRiskAssessment;
    overallRiskLevel: 0 | 1 | 2 | 3;
    recommendations: string[];
  }> {
    // 并行获取所有数据
    const [roadStatus, weather, safetyAlerts] = await Promise.all([
      this.getComprehensiveRoadStatus({ lat, lng, includeFRoadInfo: true, includeRiverCrossing: true }),
      this.getComprehensiveWeather({ lat, lng, includeWindDetails: true, includeAuroraInfo: true }),
      this.getCriticalSafetyAlerts(lat, lng),
    ]);

    // 评估路径风险（如果有路径信息）
    let routeRisk: RouteRiskAssessment | undefined;
    if (routeSegments && routeSegments.length > 0) {
      routeRisk = this.assessRouteRisk(routeSegments);
    }

    // 计算总体风险等级
    const overallRiskLevel = RiskCalculator.maxRiskLevel(
      roadStatus.riskLevel,
      RiskCalculator.calculateRiskFromAlerts(weather.alerts || []),
      RiskCalculator.calculateRiskFromAlerts(safetyAlerts),
      routeRisk?.overallRiskLevel
    );

    // 生成建议
    const recommendations: string[] = [];

    if (roadStatus.riskLevel >= 2) {
      recommendations.push(`路况风险: ${roadStatus.reason || '请谨慎驾驶'}`);
    }

    if (roadStatus.fRoadInfo && roadStatus.fRoadInfo.requires4WD) {
      recommendations.push(`F-Road ${roadStatus.fRoadInfo.roadNumber} 需要 4WD 车辆`);
    }

    if (weather.windGust && weather.windGust > 25) {
      recommendations.push(`强风警告: 瞬时风速 ${weather.windGust} m/s，注意车门安全`);
    }

    if (weather.alerts && weather.alerts.length > 0) {
      recommendations.push(`天气警报: ${weather.alerts.map(a => a.title).join(', ')}`);
    }

    if (safetyAlerts.length > 0) {
      recommendations.push(`安全警报: ${safetyAlerts.map(a => a.title).join(', ')}`);
    }

    if (routeRisk && routeRisk.overallRiskLevel >= 2) {
      recommendations.push(...routeRisk.riskReasons);
      recommendations.push(...routeRisk.insuranceRecommendations);
    }

    return {
      roadStatus,
      weather,
      safetyAlerts,
      routeRisk,
      overallRiskLevel,
      recommendations,
    };
  }
}

