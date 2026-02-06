/**
 * Airbnb Integration Service
 * 
 * 封装 Airbnb 搜索逻辑，提供缓存和错误处理
 * 用于在决策流程中集成住宿搜索
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AirbnbService } from './airbnb.service';
import { RedisService } from '../redis/redis.service';
import { AirbnbMonitoringService } from './airbnb-monitoring.service';
import { RoutePlanDraft, WorldModelContext, RouteSegment } from '../trips/decision/shared/world-model.types';

export interface AccommodationAvailability {
  available: boolean;
  listingsCount: number;
  listings?: Array<{
    id: string;
    name: string;
    location: {
      lat: number;
      lng: number;
    };
    price?: {
      amount: number;
      currency: string;
    };
    distanceFromPoint?: number; // 距离关键点的距离（米）
  }>;
  source?: string;
}

export interface AccommodationSearchParams {
  location: string | { lat: number; lng: number };
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  adults: number;
  children?: number;
  infants?: number;
  pets?: number;
}

@Injectable()
export class AirbnbIntegrationService {
  private readonly logger = new Logger(AirbnbIntegrationService.name);

  constructor(
    @Optional() private readonly airbnbService?: AirbnbService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly monitoring?: AirbnbMonitoringService,
  ) {
    if (!airbnbService) {
      this.logger.warn('AirbnbService not available, Airbnb integration will be disabled');
    }
  }

  /**
   * 检查关键节点的住宿可用性（用于 Abu 安全检查）
   * 
   * @param location 位置（坐标或地址）
   * @param checkin 入住日期
   * @param checkout 退房日期
   * @param partySize 团队人数
   */
  async checkCriticalNodeAvailability(
    location: { lat: number; lng: number } | string,
    checkin: string,
    checkout: string,
    partySize: number,
  ): Promise<AccommodationAvailability> {
    if (!this.airbnbService) {
      this.logger.debug('AirbnbService not available, skipping accommodation check');
      return { available: true, listingsCount: 0 }; // 降级：假设可用
    }

    const locationStr = typeof location === 'string' 
      ? location 
      : `${location.lat},${location.lng}`;
    
    const cacheKey = `airbnb:availability:${locationStr}:${checkin}:${checkout}:${partySize}`;
    
    // 检查缓存（住宿可用性缓存 6-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached accommodation availability for ${locationStr}`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached accommodation availability:', error);
      }
    }

    const startTime = Date.now();
    try {
      const searchResult = await this.airbnbService.searchListings({
        location: locationStr,
        checkin,
        checkout,
        adults: partySize,
        page: 1,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: true,
        responseTime,
        resultCount: searchResult.results?.length || 0,
      });

      const availability: AccommodationAvailability = {
        available: (searchResult.results?.length || 0) > 0,
        listingsCount: searchResult.results?.length || 0,
        listings: searchResult.results?.slice(0, 5).map((listing: any) => ({
          id: listing.id || listing.listingId,
          name: listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference || 
                listing.name || 
                'Unknown',
          location: {
            lat: listing.demandStayListing?.location?.coordinate?.latitude || 
                 listing.location?.lat || 
                 0,
            lng: listing.demandStayListing?.location?.coordinate?.longitude || 
                 listing.location?.lng || 
                 0,
          },
          price: listing.structuredDisplayPrice ? {
            amount: this.extractPriceAmount(listing.structuredDisplayPrice),
            currency: 'USD', // 默认，实际应该从数据中提取
          } : undefined,
        })),
        source: 'AIRBNB',
      };

      // 缓存结果（6小时）
      if (this.redisService && availability.available) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(availability), 21600);
        } catch (error) {
          this.logger.warn('Failed to cache accommodation availability:', error);
        }
      }

      return availability;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Airbnb availability check failed: ${error.message}, falling back to available`);
      // 降级：返回可用，继续使用其他数据源
      return { available: true, listingsCount: 0 };
    }
  }

  /**
   * 搜索路线走廊内的住宿（用于 Neptune 空间修复）
   * 
   * @param centerPoint 中心点（路线节点坐标）
   * @param radiusKm 搜索半径（公里，默认 5km）
   * @param checkin 入住日期
   * @param checkout 退房日期
   * @param partySize 团队人数
   */
  async searchAccommodationsInCorridor(
    centerPoint: { lat: number; lng: number },
    radiusKm: number = 5,
    checkin: string,
    checkout: string,
    partySize: number,
  ): Promise<AccommodationAvailability> {
    if (!this.airbnbService) {
      this.logger.debug('AirbnbService not available, skipping corridor search');
      return { available: false, listingsCount: 0 };
    }

    const cacheKey = `airbnb:corridor:${centerPoint.lat},${centerPoint.lng}:${radiusKm}:${checkin}:${checkout}:${partySize}`;
    
    // 检查缓存（走廊内住宿缓存 12-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached corridor accommodations`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached corridor accommodations:', error);
      }
    }

    const startTime = Date.now();
    try {
      // 使用中心点坐标搜索（Airbnb 搜索会自动在附近搜索）
      const locationStr = `${centerPoint.lat},${centerPoint.lng}`;
      const searchResult = await this.airbnbService.searchListings({
        location: locationStr,
        checkin,
        checkout,
        adults: partySize,
        page: 1,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: true,
        responseTime,
        resultCount: searchResult.results?.length || 0,
      });

      // 计算距离并筛选（简化处理：Airbnb 搜索结果默认按距离排序）
      const listings = (searchResult.results || []).slice(0, 10).map((listing: any) => {
        const listingLat = listing.demandStayListing?.location?.coordinate?.latitude || 
                          listing.location?.lat || 0;
        const listingLng = listing.demandStayListing?.location?.coordinate?.longitude || 
                          listing.location?.lng || 0;
        
        const distance = this.calculateDistance(
          centerPoint.lat,
          centerPoint.lng,
          listingLat,
          listingLng
        );

        return {
          id: listing.id || listing.listingId,
          name: listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference || 
                listing.name || 
                'Unknown',
          location: {
            lat: listingLat,
            lng: listingLng,
          },
          distanceFromPoint: distance,
          price: listing.structuredDisplayPrice ? {
            amount: this.extractPriceAmount(listing.structuredDisplayPrice),
            currency: 'USD',
          } : undefined,
        };
      }).filter((listing: any) => listing.distanceFromPoint <= radiusKm * 1000); // 转换为米

      const availability: AccommodationAvailability = {
        available: listings.length > 0,
        listingsCount: listings.length,
        listings,
        source: 'AIRBNB',
      };

      // 缓存结果（12小时）
      if (this.redisService && availability.available) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
        } catch (error) {
          this.logger.warn('Failed to cache corridor accommodations:', error);
        }
      }

      return availability;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Airbnb corridor search failed: ${error.message}`);
      return { available: false, listingsCount: 0 };
    }
  }

  /**
   * 检查住宿位置对路线节奏的影响（用于 Dr.Dre 节奏调整）
   * 
   * @param routeEndPoint 路线终点
   * @param accommodationLocation 住宿位置
   * @param checkin 入住日期
   * @param checkout 退房日期
   * @param partySize 团队人数
   */
  async checkAccommodationImpactOnPace(
    routeEndPoint: { lat: number; lng: number },
    checkin: string,
    checkout: string,
    partySize: number,
  ): Promise<{
    distanceToNearestAccommodation: number; // 米
    nearestAccommodation?: {
      id: string;
      name: string;
      location: { lat: number; lng: number };
      distance: number;
    };
    impact: 'LOW' | 'MEDIUM' | 'HIGH'; // 对路线节奏的影响
  }> {
    if (!this.airbnbService) {
      this.logger.debug('AirbnbService not available, skipping pace impact check');
      return {
        distanceToNearestAccommodation: 0,
        impact: 'LOW',
      };
    }

    try {
      const availability = await this.searchAccommodationsInCorridor(
        routeEndPoint,
        10, // 搜索半径 10km
        checkin,
        checkout,
        partySize,
      );

      if (!availability.available || !availability.listings || availability.listings.length === 0) {
        return {
          distanceToNearestAccommodation: Infinity,
          impact: 'HIGH', // 没有可用住宿，影响很大
        };
      }

      // 找到最近的住宿
      const nearest = availability.listings.reduce((prev, curr) => {
        const prevDist = prev.distanceFromPoint || Infinity;
        const currDist = curr.distanceFromPoint || Infinity;
        return currDist < prevDist ? curr : prev;
      });

      const distance = nearest.distanceFromPoint || 0;
      
      // 判断影响级别
      let impact: 'LOW' | 'MEDIUM' | 'HIGH';
      if (distance <= 5000) { // 5km 以内
        impact = 'LOW';
      } else if (distance <= 10000) { // 5-10km
        impact = 'MEDIUM';
      } else {
        impact = 'HIGH';
      }

      return {
        distanceToNearestAccommodation: distance,
        nearestAccommodation: {
          id: nearest.id,
          name: nearest.name,
          location: nearest.location,
          distance,
        },
        impact,
      };
    } catch (error: any) {
      this.logger.warn(`Airbnb pace impact check failed: ${error.message}`);
      return {
        distanceToNearestAccommodation: 0,
        impact: 'LOW',
      };
    }
  }

  /**
   * 计算两点之间的距离（米）
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   */
  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 估算路线总住宿成本（用于成本估算）
   * 
   * @param plan 路线计划草案
   * @param world 世界模型上下文
   */
  async estimateAccommodationCost(
    plan: RoutePlanDraft,
    world: WorldModelContext,
  ): Promise<{
    totalCost: number;
    currency: string;
    costPerNight: number;
    nights: number;
    breakdown: Array<{
      dayIndex: number;
      date: string;
      cost: number;
      accommodationName?: string;
    }>;
  }> {
    if (!this.airbnbService || plan.segments.length === 0) {
      return {
        totalCost: 0,
        currency: 'USD',
        costPerNight: 0,
        nights: 0,
        breakdown: [],
      };
    }

    try {
      const segmentsByDay = new Map<number, RouteSegment[]>();
      for (const segment of plan.segments) {
        const dayIndex = segment.dayIndex || 0;
        if (!segmentsByDay.has(dayIndex)) {
          segmentsByDay.set(dayIndex, []);
        }
        segmentsByDay.get(dayIndex)!.push(segment);
      }

      const breakdown: Array<{
        dayIndex: number;
        date: string;
        cost: number;
        accommodationName?: string;
      }> = [];

      const currentYear = new Date().getFullYear();
      const month = world.physical.month;
      const partySize = (world.human as any)?.partySize || 2;

      for (const [dayIndex, daySegments] of segmentsByDay.entries()) {
        const lastSegment = daySegments[daySegments.length - 1];
        const endPointLocation = lastSegment.metadata?.endLocation || 
                                 lastSegment.metadata?.toLocation ||
                                 lastSegment.metadata?.coordinates;

        if (endPointLocation && endPointLocation.lat && endPointLocation.lng) {
          const dayDate = new Date(currentYear, month - 1, dayIndex + 1);
          const checkinDate = dayDate.toISOString().split('T')[0];
          const checkoutDate = new Date(dayDate.getTime() + 86400000).toISOString().split('T')[0];

          const availability = await this.checkCriticalNodeAvailability(
            { lat: endPointLocation.lat, lng: endPointLocation.lng },
            checkinDate,
            checkoutDate,
            partySize,
          );

          if (availability.available && availability.listings && availability.listings.length > 0) {
            // 使用第一个可用住宿的价格（简化处理）
            const listing = availability.listings[0];
            const cost = listing.price?.amount || 0;
            
            breakdown.push({
              dayIndex,
              date: checkinDate,
              cost,
              accommodationName: listing.name,
            });
          }
        }
      }

      const totalCost = breakdown.reduce((sum, item) => sum + item.cost, 0);
      const nights = breakdown.length;
      const costPerNight = nights > 0 ? totalCost / nights : 0;

      return {
        totalCost,
        currency: 'USD',
        costPerNight,
        nights,
        breakdown,
      };
    } catch (error: any) {
      this.logger.warn(`Airbnb cost estimation failed: ${error.message}`);
      return {
        totalCost: 0,
        currency: 'USD',
        costPerNight: 0,
        nights: 0,
        breakdown: [],
      };
    }
  }

  /**
   * 根据用户偏好搜索住宿（用于用户偏好匹配）
   * 
   * @param location 位置
   * @param checkin 入住日期
   * @param checkout 退房日期
   * @param partySize 团队人数
   * @param preferences 用户偏好（宠物、无障碍设施等）
   */
  async searchAccommodationsWithPreferences(
    location: { lat: number; lng: number } | string,
    checkin: string,
    checkout: string,
    partySize: number,
    preferences?: {
      pets?: number;
      accessibility?: boolean;
      kitchen?: boolean;
      wifi?: boolean;
    },
  ): Promise<AccommodationAvailability> {
    if (!this.airbnbService) {
      this.logger.debug('AirbnbService not available, skipping preference search');
      return { available: false, listingsCount: 0 };
    }

    const locationStr = typeof location === 'string' 
      ? location 
      : `${location.lat},${location.lng}`;
    
    const cacheKey = `airbnb:preferences:${locationStr}:${checkin}:${checkout}:${partySize}:${JSON.stringify(preferences)}`;
    
    // 检查缓存（偏好搜索缓存 12-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached preference accommodations`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached preference accommodations:', error);
      }
    }

    const startTime = Date.now();
    try {
      const searchResult = await this.airbnbService.searchListings({
        location: locationStr,
        checkin,
        checkout,
        adults: partySize,
        pets: preferences?.pets || 0,
        page: 1,
      });

      // 记录调用指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: true,
        responseTime,
        resultCount: searchResult.results?.length || 0,
      });

      // 简化处理：Airbnb API 可能不直接支持设施过滤，这里先返回所有结果
      // 实际应用中可能需要调用 listing_details 来检查设施
      const availability: AccommodationAvailability = {
        available: (searchResult.results?.length || 0) > 0,
        listingsCount: searchResult.results?.length || 0,
        listings: searchResult.results?.slice(0, 10).map((listing: any) => ({
          id: listing.id || listing.listingId,
          name: listing.demandStayListing?.description?.name?.localizedStringWithTranslationPreference || 
                listing.name || 
                'Unknown',
          location: {
            lat: listing.demandStayListing?.location?.coordinate?.latitude || 
                 listing.location?.lat || 
                 0,
            lng: listing.demandStayListing?.location?.coordinate?.longitude || 
                 listing.location?.lng || 
                 0,
          },
          price: listing.structuredDisplayPrice ? {
            amount: this.extractPriceAmount(listing.structuredDisplayPrice),
            currency: 'USD',
          } : undefined,
        })),
        source: 'AIRBNB',
      };

      // 缓存结果（12小时）
      if (this.redisService && availability.available) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
        } catch (error) {
          this.logger.warn('Failed to cache preference accommodations:', error);
        }
      }

      return availability;
    } catch (error: any) {
      // 记录失败指标
      const responseTime = Date.now() - startTime;
      await this.monitoring?.recordCall({
        timestamp: Date.now(),
        toolName: 'airbnb_search',
        success: false,
        responseTime,
        error: error.message,
      });

      this.logger.warn(`Airbnb preference search failed: ${error.message}`);
      return { available: false, listingsCount: 0 };
    }
  }

  /**
   * 验证住宿位置是否在路线走廊内
   * 
   * @param accommodationLocation 住宿位置
   * @param routeCorridorGeom 路线走廊几何（PostGIS geometry）
   * @param bufferMeters 缓冲区（米，默认 5000）
   */
  async validateAccommodationInCorridor(
    accommodationLocation: { lat: number; lng: number },
    routeCorridorGeom: any,
    bufferMeters: number = 5000,
  ): Promise<{
    valid: boolean;
    distanceToCorridor?: number;
    explanation?: string;
  }> {
    // 简化处理：如果没有 corridorGeom，假设有效
    if (!routeCorridorGeom) {
      return {
        valid: true,
        explanation: '路线走廊几何不可用，跳过验证',
      };
    }

    // TODO: 实际应用中需要使用 PostGIS 函数验证位置是否在走廊缓冲区内
    // 这里先返回有效，实际验证需要数据库查询
    this.logger.debug(
      `验证住宿位置 (${accommodationLocation.lat}, ${accommodationLocation.lng}) 是否在路线走廊内`
    );

    return {
      valid: true,
      explanation: '位置验证（简化处理：假设有效）',
    };
  }

  /**
   * 从价格显示字符串中提取金额
   */
  private extractPriceAmount(priceDisplay: any): number {
    if (!priceDisplay) {
      return 0;
    }

    // 尝试从 primaryLine 中提取
    const primaryLine = priceDisplay.primaryLine?.accessibilityLabel || 
                       priceDisplay.primaryLine?.string || 
                       '';
    
    // 提取数字（简化处理）
    const match = primaryLine.match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }

    return 0;
  }
}
