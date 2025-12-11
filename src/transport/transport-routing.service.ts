// src/transport/transport-routing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TransportOption,
  TransportMode,
  UserContext,
  TransportRecommendation,
} from './interfaces/transport.interface';
import { TransportDecisionService } from './transport-decision.service';
import { SmartRoutesService } from './services/smart-routes.service';
import { RouteCacheService } from './services/route-cache.service';

/**
 * 交通路线规划服务
 * 
 * 负责生成交通选项（大交通和小交通）
 */
@Injectable()
export class TransportRoutingService {
  private readonly logger = new Logger(TransportRoutingService.name);

  constructor(
    private prisma: PrismaService,
    private decisionService: TransportDecisionService,
    private smartRoutesService: SmartRoutesService,
    private routeCacheService: RouteCacheService,
  ) {}

  /**
   * 规划交通路线
   * 
   * @param fromLat 起点纬度
   * @param fromLng 起点经度
   * @param toLat 终点纬度
   * @param toLng 终点经度
   * @param context 用户上下文
   * @returns 交通推荐
   */
  async planRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    context: UserContext
  ): Promise<TransportRecommendation> {
    // 判断是大交通还是小交通
    const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
    const isInterCity = distance > 50; // 超过50公里视为城市间

    if (isInterCity) {
      return this.planInterCityRoute(fromLat, fromLng, toLat, toLng, context);
    } else {
      return this.planIntraCityRoute(fromLat, fromLng, toLat, toLng, context);
    }
  }

  /**
   * 规划城市间交通（大交通）
   * 
   * 策略：
   * - 默认推荐：铁路/高铁
   * - 预算敏感型：检查长途巴士
   * - 时间敏感型：检查飞机
   */
  private async planInterCityRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    context: UserContext
  ): Promise<TransportRecommendation> {
    const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
    const options: TransportOption[] = [];

    // 1. 铁路/高铁（默认推荐）
    const railOption: TransportOption = {
      mode: TransportMode.RAIL,
      durationMinutes: this.estimateRailTime(distance),
      cost: this.estimateRailCost(distance),
      walkDistance: 500, // 到车站的步行距离
      description: '铁路/高铁：准时、市中心对市中心',
    };
    options.push(railOption);

    // 2. 长途巴士（预算敏感型）
    if (context.budgetSensitivity === 'HIGH' || distance > 300) {
      const busOption: TransportOption = {
        mode: TransportMode.BUS,
        durationMinutes: this.estimateBusTime(distance),
        cost: this.estimateBusCost(distance),
        walkDistance: 300,
        description: distance > 500
          ? '夜行巴士：省一晚房费，适合年轻人'
          : '长途巴士：经济实惠',
      };
      options.push(busOption);
    }

    // 3. 飞机（时间敏感型）
    if (context.timeSensitivity === 'HIGH' && distance > 500) {
      const flightTime = this.estimateFlightTime(distance);
      const railTime = railOption.durationMinutes;
      
      // 只有当（飞行时间 + 安检通勤）< 高铁时间时才推荐
      const totalFlightTime = flightTime + 120; // 安检+通勤约2小时
      
      if (totalFlightTime < railTime) {
        const flightOption: TransportOption = {
          mode: TransportMode.FLIGHT,
          durationMinutes: totalFlightTime,
          cost: this.estimateFlightCost(distance),
          walkDistance: 1000, // 到机场的距离
          description: '飞机：最快，但需考虑机场通勤时间',
        };
        options.push(flightOption);
      }
    }

    // 使用决策服务进行排序
    return this.decisionService.rankOptions(options, context);
  }

  /**
   * 规划市内交通（小交通）
   * 
   * 策略：
   * - 步行：< 1.5km 且天气好且无老人
   * - 公共交通：> 1.5km 且属于交通枢纽且无大件行李
   * - 打车：有大件行李 OR 有老人 OR 下雨 OR 换乘>2次
   * 
   * 特殊场景：换酒店日强制门到门
   * 
   * 优化：
   * - 短距离（< 1km）使用 PostGIS 计算，不调 API
   * - 长距离优先使用 Google Routes API（如果配置）
   * - 热门路线使用缓存
   */
  private async planIntraCityRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    context: UserContext
  ): Promise<TransportRecommendation> {
    const distance = this.calculateDistance(fromLat, fromLng, toLat, toLng);
    const distanceMeters = distance * 1000;
    const options: TransportOption[] = [];

    // ============================================
    // 优化：短距离使用 PostGIS，不调 API
    // ============================================
    const isShortDistance = this.routeCacheService.isShortDistance(distanceMeters);

    // ============================================
    // 特殊场景：换酒店日（Moving Day）
    // ============================================
    // 强制门到门策略：TAXI 到车站 → 大交通 → TAXI 到新酒店
    if (context.isMovingDay && context.hasLuggage) {
      // 换酒店日时，优先推荐打车（门到门）
      const taxiOption: TransportOption = {
        mode: TransportMode.TAXI,
        durationMinutes: this.estimateTaxiTime(distanceMeters),
        cost: this.estimateTaxiCost(distanceMeters),
        walkDistance: 0,
        description: '打车：门到门，适合换酒店日',
      };
      options.push(taxiOption);

      // 仍然提供公共交通作为备选，但会被算法惩罚
      const transitOption: TransportOption = {
        mode: TransportMode.TRANSIT,
        durationMinutes: this.estimateTransitTime(distanceMeters),
        cost: this.estimateTransitCost(distanceMeters),
        walkDistance: 800, // 换酒店日时，步行距离惩罚更大
        transfers: this.estimateTransfers(distanceMeters),
        description: '公共交通：不推荐（携带大件行李）',
      };
      options.push(transitOption);

      // 使用决策服务进行排序（会大幅惩罚公共交通）
      return this.decisionService.rankOptions(options, context);
    }

    // ============================================
    // 正常场景：市内交通
    // ============================================

    // 1. 步行选项：< 1.5km 且天气好且无老人且无行李
    if (
      distanceMeters < 1500 &&
      !context.isRaining &&
      !context.hasElderly &&
      !context.hasLuggage
    ) {
      // 短距离使用 PostGIS 精确计算
      const walkDuration = isShortDistance
        ? await this.routeCacheService.calculateShortDistanceWalkTime(
            fromLat,
            fromLng,
            toLat,
            toLng
          )
        : Math.round(distanceMeters / 80); // 降级：估算

      const walkOption: TransportOption = {
        mode: TransportMode.WALKING,
        durationMinutes: walkDuration,
        cost: 0,
        walkDistance: distanceMeters,
        description: '步行：免费，距离较近',
      };
      options.push(walkOption);
    }

    // 2. 公共交通选项：> 1.5km 或 无大件行李
    if (distanceMeters > 1500 || !context.hasLuggage) {
      // 优先使用 Google Routes API（如果配置）
      let transitOptions: TransportOption[] = [];
      
      if (!isShortDistance) {
        // 检查缓存
        const cachedRoute = await this.routeCacheService.getCachedRoute(
          fromLat,
          fromLng,
          toLat,
          toLng,
          'TRANSIT'
        );

        if (cachedRoute) {
          transitOptions = cachedRoute;
        } else {
          // 调用智能路由服务（自动选择高德或Google）
          const routeOptions = await this.smartRoutesService.getRoutes(
            fromLat,
            fromLng,
            toLat,
            toLng,
            'TRANSIT',
            {
              lessWalking: context.hasElderly || context.hasLimitedMobility, // 老人模式：少步行
            }
          );

          if (routeOptions.length > 0) {
            transitOptions = routeOptions;
            // 保存到缓存
            await this.routeCacheService.saveCachedRoute(
              fromLat,
              fromLng,
              toLat,
              toLng,
              'TRANSIT',
              routeOptions
            );
          }
        }
      }

      // 如果没有 Google API 数据，使用估算
      if (transitOptions.length === 0) {
        const transitOption: TransportOption = {
          mode: TransportMode.TRANSIT,
          durationMinutes: this.estimateTransitTime(distanceMeters),
          cost: this.estimateTransitCost(distanceMeters),
          walkDistance: 500, // 到车站的步行距离
          transfers: this.estimateTransfers(distanceMeters),
          description: '公共交通：经济实惠',
        };
        transitOptions.push(transitOption);
      }

      options.push(...transitOptions);
    }

    // 3. 打车选项（总是提供，让算法决定是否推荐）
    // 优先使用智能路由服务（自动选择高德或Google）
    let taxiOptions: TransportOption[] = [];
    
    if (!isShortDistance) {
      const routeOptions = await this.smartRoutesService.getRoutes(
        fromLat,
        fromLng,
        toLat,
        toLng,
        'DRIVING'
      );

      if (routeOptions.length > 0) {
        taxiOptions = routeOptions;
      }
    }

    // 如果没有 Google API 数据，使用估算
    if (taxiOptions.length === 0) {
      const taxiOption: TransportOption = {
        mode: TransportMode.TAXI,
        durationMinutes: this.estimateTaxiTime(distanceMeters),
        cost: this.estimateTaxiCost(distanceMeters),
        walkDistance: 0,
        description: '打车：门到门，最方便',
      };
      taxiOptions.push(taxiOption);
    }

    options.push(...taxiOptions);

    // 使用决策服务进行排序
    return this.decisionService.rankOptions(options, context);
  }

  /**
   * 计算两点间距离（公里）
   * 使用 Haversine 公式
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // 地球半径（公里）
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // ========== 估算函数 ==========

  private estimateRailTime(distanceKm: number): number {
    // 高铁平均速度：250 km/h
    return Math.round((distanceKm / 250) * 60);
  }

  private estimateRailCost(distanceKm: number): number {
    // 高铁费用：约 0.5 元/公里
    return Math.round(distanceKm * 0.5);
  }

  private estimateBusTime(distanceKm: number): number {
    // 长途巴士平均速度：80 km/h
    return Math.round((distanceKm / 80) * 60);
  }

  private estimateBusCost(distanceKm: number): number {
    // 长途巴士费用：约 0.2 元/公里
    return Math.round(distanceKm * 0.2);
  }

  private estimateFlightTime(distanceKm: number): number {
    // 飞行时间：约 600 km/h（包含起降）
    return Math.round((distanceKm / 600) * 60);
  }

  private estimateFlightCost(distanceKm: number): number {
    // 飞机费用：约 1 元/公里（简化估算）
    return Math.round(distanceKm * 1);
  }

  private estimateTransitTime(distanceMeters: number): number {
    // 地铁平均速度：30 km/h（包含等车、换乘）
    return Math.round((distanceMeters / 1000 / 30) * 60);
  }

  private estimateTransitCost(distanceMeters: number): number {
    // 地铁费用：起步 3 元，每 5 公里 +2 元
    if (distanceMeters < 5000) {
      return 3;
    }
    return 3 + Math.floor((distanceMeters - 5000) / 5000) * 2;
  }

  private estimateTransfers(distanceMeters: number): number {
    // 简化估算：每 10 公里可能需要换乘 1 次
    return Math.floor(distanceMeters / 10000);
  }

  private estimateTaxiTime(distanceMeters: number): number {
    // 打车平均速度：25 km/h（考虑堵车）
    return Math.round((distanceMeters / 1000 / 25) * 60);
  }

  private estimateTaxiCost(distanceMeters: number): number {
    // 打车费用：起步 15 元，每公里 3 元
    const distanceKm = distanceMeters / 1000;
    return Math.round(15 + distanceKm * 3);
  }
}

