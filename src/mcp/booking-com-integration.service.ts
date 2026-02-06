/**
 * Booking.com Integration Service
 * 
 * 业务逻辑层，封装 Booking.com 租车搜索的集成逻辑
 * 参考 AirbnbIntegrationService 的设计模式
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BookingComService } from './booking-com.service';
import { RedisService } from '../redis/redis.service';
import { BookingComMonitoringService } from './booking-com-monitoring.service';
import { RoutePlanDraft, WorldModelContext } from '../trips/decision/shared/world-model.types';

export interface CarRentalAvailability {
  available: boolean;
  rentalsCount: number;
  rentals: Array<{
    id: string;
    company: string;
    vehicleType: string;
    price: {
      amount: number;
      currency: string;
    };
    pickupLocation: {
      lat: number;
      lng: number;
      address?: string;
    };
    dropoffLocation: {
      lat: number;
      lng: number;
      address?: string;
    };
    pickupTime: string;
    dropoffTime: string;
    distanceFromPoint?: number; // 距离关键节点的距离（米）
  }>;
  source: 'BOOKING_COM';
}

export interface CarRentalPaceImpact {
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  distanceToPickupLocation: number; // 米
  distanceToDropoffLocation: number; // 米
  explanation: string;
}

@Injectable()
export class BookingComIntegrationService {
  private readonly logger = new Logger(BookingComIntegrationService.name);

  constructor(
    @Optional() private readonly bookingComService?: BookingComService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly monitoring?: BookingComMonitoringService,
  ) {}

  /**
   * 检查关键节点的租车可用性
   * 
   * 用于 Abu 安全检查：验证路线关键节点是否有可用租车
   */
  async checkCriticalNodeCarRentalAvailability(
    pickupLocation: { lat: number; lng: number },
    dropoffLocation: { lat: number; lng: number },
    pickupTime: string,
    dropoffTime: string,
    driverAge: number,
  ): Promise<CarRentalAvailability> {
    if (!this.bookingComService) {
      this.logger.debug('BookingComService not available, skipping car rental check');
      return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
    }

    const cacheKey = `booking-com:availability:${pickupLocation.lat},${pickupLocation.lng}:${dropoffLocation.lat},${dropoffLocation.lng}:${pickupTime}:${dropoffTime}:${driverAge}`;
    
    // 检查缓存（租车可用性缓存 6-12 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached car rental availability`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached car rental availability:', error);
      }
    }

    const startTime = Date.now();
    try {
      const searchResult = await this.bookingComService.searchCarRentals({
        pick_up_latitude: pickupLocation.lat,
        pick_up_longitude: pickupLocation.lng,
        drop_off_latitude: dropoffLocation.lat,
        drop_off_longitude: dropoffLocation.lng,
        pick_up_time: pickupTime,
        drop_off_time: dropoffTime,
        driver_age: driverAge,
        currency_code: 'USD',
        location: 'US',
      });

      const rentals = (searchResult.data || []).slice(0, 10).map((rental: any) => ({
        id: rental.id || `rental-${Date.now()}-${Math.random()}`,
        company: rental.company || 'Unknown',
        vehicleType: rental.vehicle_type || 'Standard',
        price: rental.price || { amount: 0, currency: 'USD' },
        pickupLocation: {
          lat: pickupLocation.lat,
          lng: pickupLocation.lng,
          address: rental.pickup_location?.address,
        },
        dropoffLocation: {
          lat: dropoffLocation.lat,
          lng: dropoffLocation.lng,
          address: rental.dropoff_location?.address,
        },
        pickupTime,
        dropoffTime,
      }));

      const availability: CarRentalAvailability = {
        available: rentals.length > 0,
        rentalsCount: rentals.length,
        rentals,
        source: 'BOOKING_COM',
      };

      // 缓存结果（6小时）
      if (this.redisService && availability.available) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(availability), 21600);
        } catch (error) {
          this.logger.warn('Failed to cache car rental availability:', error);
        }
      }

      // 记录监控指标
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'checkCriticalNodeCarRentalAvailability',
          success: true,
          responseTime,
          resultCount: rentals.length,
        });
      }

      return availability;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'checkCriticalNodeCarRentalAvailability',
          success: false,
          responseTime,
          error: error.message,
        });
      }
      this.logger.warn(`Car rental availability check failed: ${error.message}`);
      return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
    }
  }

  /**
   * 检查租车对路线节奏的影响
   * 
   * 用于 Dr.Dre 节奏调整：分析取车/还车位置对行程节奏的影响
   */
  async checkCarRentalImpactOnPace(
    pickupLocation: { lat: number; lng: number },
    dropoffLocation: { lat: number; lng: number },
    pickupTime: string,
    dropoffTime: string,
    driverAge: number,
  ): Promise<CarRentalPaceImpact> {
    if (!this.bookingComService) {
      this.logger.debug('BookingComService not available, skipping pace impact check');
      return {
        impactLevel: 'LOW',
        distanceToPickupLocation: 0,
        distanceToDropoffLocation: 0,
        explanation: 'Booking.com service not available',
      };
    }

    const startTime = Date.now();
    try {
      // 搜索租车选项
      const searchResult = await this.bookingComService.searchCarRentals({
        pick_up_latitude: pickupLocation.lat,
        pick_up_longitude: pickupLocation.lng,
        drop_off_latitude: dropoffLocation.lat,
        drop_off_longitude: dropoffLocation.lng,
        pick_up_time: pickupTime,
        drop_off_time: dropoffTime,
        driver_age: driverAge,
        currency_code: 'USD',
        location: 'US',
      });

      const rentals = searchResult.data || [];
      if (rentals.length === 0) {
        return {
          impactLevel: 'HIGH',
          distanceToPickupLocation: Infinity,
          distanceToDropoffLocation: Infinity,
          explanation: 'No car rentals available',
        };
      }

      // 计算最近的租车位置距离（简化处理：假设租车位置就是 pickup/dropoff 位置）
      const distanceToPickup = 0; // 取车位置就是 pickupLocation
      const distanceToDropoff = 0; // 还车位置就是 dropoffLocation

      // 判断影响级别
      let impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (distanceToPickup > 5000 || distanceToDropoff > 5000) {
        impactLevel = 'HIGH';
      } else if (distanceToPickup > 2000 || distanceToDropoff > 2000) {
        impactLevel = 'MEDIUM';
      }

      const result = {
        impactLevel,
        distanceToPickupLocation: distanceToPickup,
        distanceToDropoffLocation: distanceToDropoff,
        explanation: `Car rental available: ${rentals.length} options, impact level: ${impactLevel}`,
      };

      // 记录监控指标
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'checkCarRentalImpactOnPace',
          success: true,
          responseTime,
          resultCount: rentals.length,
        });
      }

      return result;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'checkCarRentalImpactOnPace',
          success: false,
          responseTime,
          error: error.message,
        });
      }
      this.logger.warn(`Car rental pace impact check failed: ${error.message}`);
      return {
        impactLevel: 'LOW',
        distanceToPickupLocation: 0,
        distanceToDropoffLocation: 0,
        explanation: `Check failed: ${error.message}`,
      };
    }
  }

  /**
   * 搜索路线走廊内的租车选项
   * 
   * 用于 Neptune 空间修复：当公共交通不可用时，搜索租车作为替代方案
   */
  async searchCarRentalsInCorridor(
    centerPoint: { lat: number; lng: number },
    radiusKm: number = 5,
    pickupTime: string,
    dropoffTime: string,
    driverAge: number,
  ): Promise<CarRentalAvailability> {
    if (!this.bookingComService) {
      this.logger.debug('BookingComService not available, skipping corridor search');
      return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
    }

    const cacheKey = `booking-com:corridor:${centerPoint.lat},${centerPoint.lng}:${radiusKm}:${pickupTime}:${dropoffTime}:${driverAge}`;
    
    // 检查缓存（走廊内租车缓存 12-24 小时）
    if (this.redisService) {
      try {
        const cached = await this.redisService.get<string>(cacheKey);
        if (cached) {
          this.logger.debug(`Using cached corridor car rentals`);
          return JSON.parse(cached);
        }
      } catch (error) {
        this.logger.warn('Failed to get cached corridor car rentals:', error);
      }
    }

    const startTime = Date.now();
    try {
      // 使用中心点坐标搜索（Booking.com 搜索会自动在附近搜索）
      const searchResult = await this.bookingComService.searchCarRentals({
        pick_up_latitude: centerPoint.lat,
        pick_up_longitude: centerPoint.lng,
        drop_off_latitude: centerPoint.lat, // 简化：还车位置与取车位置相同
        drop_off_longitude: centerPoint.lng,
        pick_up_time: pickupTime,
        drop_off_time: dropoffTime,
        driver_age: driverAge,
        currency_code: 'USD',
        location: 'US',
      });

      // 计算距离并筛选
      const rentals = (searchResult.data || []).slice(0, 10).map((rental: any) => {
        const rentalLat = rental.pickup_location?.lat || centerPoint.lat;
        const rentalLng = rental.pickup_location?.lng || centerPoint.lng;
        
        const distance = this.calculateDistance(
          centerPoint.lat,
          centerPoint.lng,
          rentalLat,
          rentalLng
        );

        return {
          id: rental.id || `rental-${Date.now()}-${Math.random()}`,
          company: rental.company || 'Unknown',
          vehicleType: rental.vehicle_type || 'Standard',
          price: rental.price || { amount: 0, currency: 'USD' },
          pickupLocation: {
            lat: rentalLat,
            lng: rentalLng,
            address: rental.pickup_location?.address,
          },
          dropoffLocation: {
            lat: rental.dropoff_location?.lat || rentalLat,
            lng: rental.dropoff_location?.lng || rentalLng,
            address: rental.dropoff_location?.address,
          },
          pickupTime,
          dropoffTime,
          distanceFromPoint: distance,
        };
      }).filter((rental: any) => rental.distanceFromPoint <= radiusKm * 1000); // 转换为米

      const availability: CarRentalAvailability = {
        available: rentals.length > 0,
        rentalsCount: rentals.length,
        rentals,
        source: 'BOOKING_COM',
      };

      // 缓存结果（12小时）
      if (this.redisService && availability.available) {
        try {
          await this.redisService.set(cacheKey, JSON.stringify(availability), 43200);
        } catch (error) {
          this.logger.warn('Failed to cache corridor car rentals:', error);
        }
      }

      // 记录监控指标
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'searchCarRentalsInCorridor',
          success: true,
          responseTime,
          resultCount: rentals.length,
        });
      }

      return availability;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      if (this.monitoring) {
        await this.monitoring.recordCall({
          timestamp: Date.now(),
          toolName: 'searchCarRentalsInCorridor',
          success: false,
          responseTime,
          error: error.message,
        });
      }
      this.logger.warn(`Corridor car rental search failed: ${error.message}`);
      return { available: false, rentalsCount: 0, rentals: [], source: 'BOOKING_COM' };
    }
  }

  /**
   * 估算租车成本
   * 
   * 用于 TripService 成本估算
   */
  async estimateCarRentalCost(
    plan: RoutePlanDraft,
    world: WorldModelContext,
  ): Promise<{
    totalCost: number;
    currency: string;
    costPerDay: number;
    days: number;
    breakdown: Array<{
      dayIndex: number;
      date: string;
      cost: number;
      rentalCompany?: string;
    }>;
  }> {
    if (!this.bookingComService) {
      this.logger.debug('BookingComService not available, skipping cost estimation');
      return {
        totalCost: 0,
        currency: 'USD',
        costPerDay: 0,
        days: 0,
        breakdown: [],
      };
    }

    try {
      // 简化处理：估算整个行程的租车成本
      // 实际应用中可能需要按天搜索
      const segmentsByDay = new Map<number, any[]>();
      for (const segment of plan.segments) {
        const dayIndex = segment.dayIndex || 0;
        if (!segmentsByDay.has(dayIndex)) {
          segmentsByDay.set(dayIndex, []);
        }
        segmentsByDay.get(dayIndex)!.push(segment);
      }

      const days = segmentsByDay.size;
      if (days === 0) {
        return {
          totalCost: 0,
          currency: 'USD',
          costPerDay: 0,
          days: 0,
          breakdown: [],
        };
      }

      // 获取第一天和最后一天的坐标
      const firstDaySegments = segmentsByDay.get(0) || [];
      const lastDaySegments = segmentsByDay.get(days - 1) || [];
      
      const firstSegment = firstDaySegments[0];
      const lastSegment = lastDaySegments[lastDaySegments.length - 1];

      const pickupLocation = firstSegment?.metadata?.startLocation || 
                            firstSegment?.metadata?.fromLocation;
      const dropoffLocation = lastSegment?.metadata?.endLocation || 
                             lastSegment?.metadata?.toLocation;

      if (!pickupLocation || !dropoffLocation) {
        return {
          totalCost: 0,
          currency: 'USD',
          costPerDay: 0,
          days: 0,
          breakdown: [],
        };
      }

      // 估算日期和时间
      const currentYear = new Date().getFullYear();
      const month = world.physical.month;
      const firstDayDate = new Date(currentYear, month - 1, 1);
      const lastDayDate = new Date(currentYear, month - 1, days);
      
      const pickupTime = '10:00';
      const dropoffTime = '10:00';
      const driverAge = (world.human as any)?.driverAge || 25;

      // 搜索租车并获取价格
      const searchResult = await this.bookingComService.searchCarRentals({
        pick_up_latitude: pickupLocation.lat,
        pick_up_longitude: pickupLocation.lng,
        drop_off_latitude: dropoffLocation.lat,
        drop_off_longitude: dropoffLocation.lng,
        pick_up_time: pickupTime,
        drop_off_time: dropoffTime,
        driver_age: driverAge,
        currency_code: 'USD',
        location: 'US',
        pick_up_date: firstDayDate.toISOString().split('T')[0],
        drop_off_date: lastDayDate.toISOString().split('T')[0],
      });

      const rentals = searchResult.data || [];
      if (rentals.length === 0) {
        return {
          totalCost: 0,
          currency: 'USD',
          costPerDay: 0,
          days,
          breakdown: [],
        };
      }

      // 选择价格最低的租车
      const cheapestRental = rentals.reduce((prev, curr) => {
        const prevPrice = prev.price?.amount || Infinity;
        const currPrice = curr.price?.amount || Infinity;
        return currPrice < prevPrice ? curr : prev;
      });

      const totalCost = cheapestRental.price?.amount || 0;
      const costPerDay = totalCost / days;

      // 生成成本明细
      const breakdown = Array.from({ length: days }, (_, i) => {
        const dayDate = new Date(currentYear, month - 1, i + 1);
        return {
          dayIndex: i,
          date: dayDate.toISOString().split('T')[0],
          cost: costPerDay,
          rentalCompany: cheapestRental.company,
        };
      });

      return {
        totalCost,
        currency: cheapestRental.price?.currency || 'USD',
        costPerDay,
        days,
        breakdown,
      };
    } catch (error: any) {
      this.logger.warn(`Car rental cost estimation failed: ${error.message}`);
      return {
        totalCost: 0,
        currency: 'USD',
        costPerDay: 0,
        days: 0,
        breakdown: [],
      };
    }
  }

  /**
   * 计算两点之间的距离（米）
   * 使用 Haversine 公式
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
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
}
