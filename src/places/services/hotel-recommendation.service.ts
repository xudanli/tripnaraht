// src/places/services/hotel-recommendation.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HotelRecommendationStrategy,
  HotelRecommendationRequest,
  HotelRecommendation,
  LocationScore,
} from '../interfaces/hotel-strategy.interface';
import { HotelCostCalculator } from '../../common/utils/hotel-cost-calculator.util';
import { PlaceCategory } from '@prisma/client';
import { HotelPriceService } from '../../hotels/services/hotel-price.service';
import { TimeValueCalculator } from '../../common/utils/time-value-calculator.util';

@Injectable()
export class HotelRecommendationService {
  constructor(
    private prisma: PrismaService,
    private hotelPriceService: HotelPriceService
  ) {}

  /**
   * 推荐酒店
   * 
   * 根据不同的策略推荐合适的酒店
   * 如果 strategy 未指定，将根据行程密度自动选择
   */
  async recommendHotels(
    request: HotelRecommendationRequest
  ): Promise<HotelRecommendation[]> {
    // 获取景点列表
    const attractions = await this.getAttractions(request);
    
    if (attractions.length === 0) {
      throw new NotFoundException('未找到景点信息，无法推荐酒店');
    }

    // 如果策略未指定，根据行程密度自动选择
    let strategy = request.strategy;
    let autoSelected = false;
    let densityAnalysis = null;

    // 如果时间价值未指定且提供了 tripId，自动计算时间价值
    let timeValue = request.timeValuePerHour;
    if (!timeValue && request.tripId) {
      try {
        timeValue = await TimeValueCalculator.calculateFromTrip(
          request.tripId,
          this.prisma
        );
      } catch (error) {
        // 如果计算失败，使用默认值
        timeValue = 50;
      }
    }

    if (!strategy && request.tripId) {
      const analysis = await this.calculateTripDensity(request.tripId);
      const autoSelection = await this.autoSelectStrategy(analysis);
      strategy = autoSelection.strategy;
      autoSelected = true;
      densityAnalysis = {
        density: analysis.density,
        avgPlacesPerDay: analysis.avgPlacesPerDay,
        totalDays: analysis.totalDays,
        totalAttractions: analysis.totalAttractions,
        reason: autoSelection.reason,
      };
    }

    // 更新请求中的时间价值
    const updatedRequest = {
      ...request,
      timeValuePerHour: timeValue || request.timeValuePerHour || 50,
    };

    // 根据策略选择算法
    let recommendations: HotelRecommendation[];
    switch (strategy) {
      case HotelRecommendationStrategy.CENTROID:
        recommendations = await this.recommendByCentroid(attractions, updatedRequest);
        break;
      
      case HotelRecommendationStrategy.HUB:
        recommendations = await this.recommendByHub(attractions, updatedRequest);
        break;
      
      case HotelRecommendationStrategy.RESORT:
        recommendations = await this.recommendByResort(attractions, updatedRequest);
        break;
      
      default:
        recommendations = await this.recommendByCentroid(attractions, updatedRequest);
    }

    // 如果自动选择，添加密度分析信息到推荐理由
    if (autoSelected && densityAnalysis && recommendations.length > 0) {
      recommendations[0].recommendationReason = 
        `${recommendations[0].recommendationReason}（${densityAnalysis.reason}）`;
    }

    return recommendations;
  }

  /**
   * 计算行程密度
   * 
   * 分析行程中每天平均有多少个景点，用于判断行程密度
   */
  private async calculateTripDensity(
    tripId: string
  ): Promise<{
    totalDays: number;
    totalAttractions: number;
    avgPlacesPerDay: number;
    density: 'HIGH' | 'MEDIUM' | 'LOW';
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: {
            items: {
              include: {
                place: {
                  where: {
                    category: PlaceCategory.ATTRACTION,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    // 计算总天数和总景点数
    const totalDays = trip.days.length;
    const seenAttractionIds = new Set<number>();
    
    for (const day of trip.days) {
      for (const item of day.items) {
        if (item.place && item.place.category === PlaceCategory.ATTRACTION) {
          seenAttractionIds.add(item.place.id);
        }
      }
    }

    const totalAttractions = seenAttractionIds.size;
    const avgPlacesPerDay = totalDays > 0 ? totalAttractions / totalDays : 0;

    // 判断密度等级
    let density: 'HIGH' | 'MEDIUM' | 'LOW';
    if (avgPlacesPerDay >= 4) {
      density = 'HIGH';
    } else if (avgPlacesPerDay >= 2) {
      density = 'MEDIUM';
    } else {
      density = 'LOW';
    }

    return {
      totalDays,
      totalAttractions,
      avgPlacesPerDay: Math.round(avgPlacesPerDay * 10) / 10,
      density,
    };
  }

  /**
   * 根据行程密度自动选择推荐策略
   */
  private async autoSelectStrategy(
    densityAnalysis: {
      density: 'HIGH' | 'MEDIUM' | 'LOW';
      avgPlacesPerDay: number;
      totalDays: number;
      totalAttractions: number;
    }
  ): Promise<{
    strategy: HotelRecommendationStrategy;
    reason: string;
  }> {
    switch (densityAnalysis.density) {
      case 'HIGH':
        return {
          strategy: HotelRecommendationStrategy.CENTROID,
          reason: `检测到高密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。建议牺牲档次，换取位置。推荐住在市中心 3 星级，以减少奔波。`,
        };
      
      case 'MEDIUM':
        return {
          strategy: HotelRecommendationStrategy.HUB,
          reason: `检测到中等密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。推荐住在交通枢纽附近，平衡位置和体验。`,
        };
      
      case 'LOW':
        return {
          strategy: HotelRecommendationStrategy.RESORT,
          reason: `检测到低密度行程（每天 ${densityAnalysis.avgPlacesPerDay} 个景点）。建议牺牲位置，换取体验。推荐住在稍微偏远的 4-5 星级酒店/度假村。`,
        };
      
      default:
        return {
          strategy: HotelRecommendationStrategy.HUB,
          reason: '推荐住在交通枢纽附近，平衡位置和体验。',
        };
    }
  }

  /**
   * 获取景点列表
   */
  private async getAttractions(
    request: HotelRecommendationRequest
  ): Promise<Array<{ id: number; location: any; name: string }>> {
    if (request.attractionIds && request.attractionIds.length > 0) {
      // 直接使用提供的景点 ID
      const places = await this.prisma.place.findMany({
        where: {
          id: { in: request.attractionIds },
          category: PlaceCategory.ATTRACTION,
        },
        // location 是 PostGIS 字段，需要特殊处理
      });
      return places.map((p) => ({
        id: p.id,
        location: (p as any).location, // PostGIS 字段
        name: p.nameEN || p.nameCN, // 优先显示英文名称
      }));
    } else if (request.tripId) {
      // 从行程中获取景点
      const trip = await this.prisma.trip.findUnique({
        where: { id: request.tripId },
        include: {
          days: {
            include: {
              items: {
                include: {
                  place: {
                    where: {
                      category: PlaceCategory.ATTRACTION,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!trip) {
        throw new NotFoundException(`行程 ${request.tripId} 不存在`);
      }

      // 提取所有景点
      const attractions: Array<{ id: number; location: any; name: string }> = [];
      const seenIds = new Set<number>();

      for (const day of trip.days) {
        for (const item of day.items) {
          if (item.place && !seenIds.has(item.place.id)) {
            attractions.push({
              id: item.place.id,
              location: (item.place as any).location, // PostGIS 字段
              name: item.place.nameEN || item.place.nameCN, // 优先显示英文名称
            });
            seenIds.add(item.place.id);
          }
        }
      }

      return attractions;
    } else {
      throw new NotFoundException('请提供 tripId 或 attractionIds');
    }
  }

  /**
   * 策略 A：重心法 (Centroid Strategy)
   * 
   * 找出所有景点的地理中心点，推荐距离中心点最近的酒店
   */
  private async recommendByCentroid(
    attractions: Array<{ id: number; location: any; name: string }>,
    request: HotelRecommendationRequest
  ): Promise<HotelRecommendation[]> {
    // 使用 PostGIS 计算中心点并找最近的酒店
    const hotels = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
      },
      include: {
        city: true, // 包含城市信息
      },
      take: 50, // 取更多候选，后续会按成本排序
    });

    // 计算每个酒店到所有景点的平均距离
    const hotelsWithDistance = await Promise.all(
      hotels.map(async (hotel) => {
        const avgDistance = await this.calculateAvgDistanceToAttractions(
          hotel,
          attractions
        );
        return {
          id: hotel.id,
          nameCN: hotel.nameCN,
          nameEN: hotel.nameEN,
          metadata: hotel.metadata,
          city: hotel.city, // 包含城市信息
          distance_meters: avgDistance,
        };
      })
    );

    return await this.formatRecommendations(
      hotelsWithDistance,
      request,
      attractions,
      '重心法：位于所有景点的地理中心，通勤总和最小'
    );
  }

  /**
   * 策略 B：交通枢纽法 (Hub Strategy)
   * 
   * 优先推荐距离交通枢纽（地铁站/车站）近的酒店
   */
  private async recommendByHub(
    attractions: Array<{ id: number; location: any; name: string }>,
    request: HotelRecommendationRequest
  ): Promise<HotelRecommendation[]> {
    // 查找交通枢纽附近的酒店
    const hotels = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
        // 这里应该添加 location_score 过滤条件
      },
      take: 20,
    });

    // 按 nearest_station_walk_min 排序
    const sortedHotels = hotels
      .map((h: any) => {
        const metadata = h.metadata as any;
        const locationScore = metadata?.location_score;
        return {
          hotel: h,
          walkMin: locationScore?.nearest_station_walk_min || 999,
        };
      })
      .sort((a, b) => a.walkMin - b.walkMin)
      .slice(0, 20);

    // 计算每个酒店到所有景点的平均距离
    const hotelsWithDistance = await Promise.all(
      sortedHotels.map(async (item) => {
        const avgDistance = await this.calculateAvgDistanceToAttractions(
          item.hotel,
          attractions
        );
        return {
          id: item.hotel.id,
          nameCN: item.hotel.nameCN,
          nameEN: item.hotel.nameEN,
          metadata: item.hotel.metadata,
          city: item.hotel.city, // 包含城市信息
          distance_meters: avgDistance,
        };
      })
    );

    return await this.formatRecommendations(
      hotelsWithDistance,
      request,
      attractions,
      '交通枢纽法：距离地铁站/车站近，交通便利'
    );
  }

  /**
   * 策略 C：度假模式 (Resort Strategy)
   * 
   * 牺牲距离，换取档次（推荐城市边缘的高档酒店）
   */
  private async recommendByResort(
    attractions: Array<{ id: number; location: any; name: string }>,
    request: HotelRecommendationRequest
  ): Promise<HotelRecommendation[]> {
    const hotels = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
      },
      include: {
        city: true, // 包含城市信息
      },
      take: 50, // 取更多候选
    });

    // 筛选：优先高星级（4-5星），距离作为次要条件
    // 放宽筛选条件：距离中心 > 3km 或星级 >= 4
    // 优先选择：星级高且距离适中的酒店
    const resortHotels = hotels
      .map((h: any) => {
        const metadata = h.metadata as any;
        const locationScore = metadata?.location_score;
        const tier = metadata?.hotel_tier || 0;
        const centerDistance = locationScore?.center_distance_km || 0;
        return {
          hotel: h,
          centerDistance,
          tier,
          // 计算综合得分：星级优先，距离适中（3-10km）加分
          score: tier * 10 + (centerDistance >= 3 && centerDistance <= 10 ? 5 : 0),
        };
      })
      .filter((item) => {
        // 放宽条件：星级 >= 4 或（星级 >= 3 且距离 > 3km）
        return item.tier >= 4 || (item.tier >= 3 && item.centerDistance > 3);
      })
      .sort((a, b) => {
        // 先按得分降序，再按星级降序
        if (b.score !== a.score) return b.score - a.score;
        return b.tier - a.tier;
      })
      .slice(0, 20);

    // 计算每个酒店到所有景点的平均距离
    const hotelsWithDistance = await Promise.all(
      resortHotels.map(async (item) => {
        const avgDistance = await this.calculateAvgDistanceToAttractions(
          item.hotel,
          attractions
        );
        return {
          id: item.hotel.id,
          nameCN: item.hotel.nameCN,
          nameEN: item.hotel.nameEN,
          metadata: item.hotel.metadata,
          city: item.hotel.city, // 包含城市信息
          distance_meters: avgDistance,
        };
      })
    );

    return await this.formatRecommendations(
      hotelsWithDistance,
      request,
      attractions,
      '度假模式：位于城市边缘，房间大、档次高，适合休闲游'
    );
  }

  /**
   * 计算酒店到所有景点的平均距离（米）
   * 
   * 优化：使用批量查询一次性计算所有距离
   */
  private async calculateAvgDistanceToAttractions(
    hotel: { id: number; location?: any },
    attractions: Array<{ id: number; location?: any; name: string }>
  ): Promise<number> {
    if (attractions.length === 0) {
      return 0;
    }

    try {
      // 使用 PostGIS 逐个查询（更可靠，景点数量通常不多）
      const distances = await Promise.all(
        attractions.map(async (attraction) => {
          try {
            // 如果两个地点都有 id，使用 PostGIS 查询（最准确）
            if (hotel.id && attraction.id) {
              const result = await this.prisma.$queryRaw<Array<{ distance_meters: number }>>`
                SELECT 
                  ST_Distance(
                    h.location::geography,
                    a.location::geography
                  ) as distance_meters
                FROM "Place" h
                CROSS JOIN "Place" a
                WHERE h.id = ${hotel.id}
                  AND a.id = ${attraction.id}
                  AND h.location IS NOT NULL
                  AND a.location IS NOT NULL
              `;
              const distance = result[0]?.distance_meters;
              if (distance && distance > 0) {
                return distance;
              }
            }

            // 降级：尝试提取坐标并使用 Haversine
            const coords1 = this.extractCoordinatesSync(hotel.location);
            const coords2 = this.extractCoordinatesSync(attraction.location);

            if (coords1 && coords2) {
              return this.calculateHaversineDistance(
                { lat: coords1.lat, lng: coords1.lng },
                { lat: coords2.lat, lng: coords2.lng }
              );
            }

            return 0;
          } catch (error) {
            // 最后降级：使用 Haversine 公式（即使没有坐标也尝试）
            return this.calculateHaversineDistance(
              hotel.location,
              attraction.location
            );
          }
        })
      );

      // 计算平均距离
      const validDistances = distances.filter((d) => d > 0);
      if (validDistances.length === 0) {
        return 0;
      }
      const sum = validDistances.reduce((acc, dist) => acc + dist, 0);
      return Math.round(sum / validDistances.length);
    } catch (error) {
      // 如果所有方法都失败，使用 Haversine 公式作为最后降级方案
      const distances = attractions.map((attraction) =>
        this.calculateHaversineDistance(hotel.location, attraction.location)
      );
      const validDistances = distances.filter((d) => d > 0);
      if (validDistances.length === 0) {
        return 0;
      }
      const sum = validDistances.reduce((acc, dist) => acc + dist, 0);
      return Math.round(sum / validDistances.length);
    }
  }


  /**
   * 使用 Haversine 公式计算两点间距离（米）
   */
  private calculateHaversineDistance(
    location1: any,
    location2: any
  ): number {
    try {
      let coords1: { lat: number; lng: number } | null;
      let coords2: { lat: number; lng: number } | null;

      // 如果已经是坐标对象，直接使用
      if (location1 && typeof location1 === 'object' && 'lat' in location1 && 'lng' in location1) {
        coords1 = location1;
      } else {
        coords1 = this.extractCoordinatesSync(location1);
      }

      if (location2 && typeof location2 === 'object' && 'lat' in location2 && 'lng' in location2) {
        coords2 = location2;
      } else {
        coords2 = this.extractCoordinatesSync(location2);
      }

      if (!coords1 || !coords2) {
        return 0;
      }

      const R = 6371000; // 地球半径（米）
      const dLat = this.toRadians(coords2.lat - coords1.lat);
      const dLng = this.toRadians(coords2.lng - coords1.lng);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRadians(coords1.lat)) *
          Math.cos(this.toRadians(coords2.lat)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    } catch (error) {
      return 0;
    }
  }

  /**
   * 同步提取坐标（用于 Haversine 计算）
   */
  private extractCoordinatesSync(location: any): { lat: number; lng: number } | null {
    if (!location) {
      return null;
    }

    if (typeof location === 'string') {
      const match = location.match(/POINT\(([^)]+)\)/);
      if (match) {
        const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
        return { lat, lng };
      }
    }

    if (typeof location === 'object') {
      if (location.coordinates) {
        return { lng: location.coordinates[0], lat: location.coordinates[1] };
      }
      if (location.lat && location.lng) {
        return { lat: location.lat, lng: location.lng };
      }
    }

    return null;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * 格式化推荐结果
   */
  private async formatRecommendations(
    hotels: Array<{
      id: number;
      nameCN: string;
      nameEN?: string | null;
      metadata: any;
      city?: { name: string } | null;
      distance_meters: number;
    }>,
    request: HotelRecommendationRequest,
    attractions: Array<{ id: number; location: any; name: string }>,
    defaultReason: string
  ): Promise<HotelRecommendation[]> {
    const recommendations: HotelRecommendation[] = [];
    
    // 获取当前日期（用于季度估算）
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
    
    for (const hotel of hotels) {
      const metadata = hotel.metadata || {};
      const locationScore = metadata.location_score || {};
      let roomRate = metadata.room_rate || metadata.price || 0;
      const tier = metadata.hotel_tier || 0;

      // 如果房价为 null 或 0，尝试从价格服务获取
      if ((roomRate === null || roomRate === 0) && hotel.city) {
        try {
          const cityName = hotel.city.name;
          // 如果星级为 0，使用 3 星作为默认值（中等档次）
          const effectiveTier = tier > 0 ? tier : 3;
          const priceEstimate = await this.hotelPriceService.estimatePrice(
            cityName,
            effectiveTier,
            currentYear,
            currentQuarter
          );
          roomRate = priceEstimate.estimatedPrice;
        } catch (error) {
          // 如果价格服务失败，继续使用 0
          // 可以记录日志但不影响推荐
        }
      }

      // 过滤星级要求
      if (request.minTier !== undefined && tier < request.minTier) {
        continue;
      }
      if (request.maxTier !== undefined && tier > request.maxTier) {
        continue;
      }

      // 计算隐形成本（如果启用）
      let totalCost: number | undefined;
      let costBreakdown: any | undefined;

      if (request.includeHiddenCost && hotel.distance_meters > 0) {
        // 使用到景点的平均距离计算成本
        const distanceKm = hotel.distance_meters / 1000;
        const transportCost = HotelCostCalculator.estimateTransportCost(distanceKm);
        
        // 根据距离估算通勤时间（使用地铁，因为这是最常见的交通方式）
        const commuteTime = HotelCostCalculator.estimateCommuteTime(distanceKm, 'metro');
        const timeValue = request.timeValuePerHour || 50;

        costBreakdown = HotelCostCalculator.calculateCostBreakdown(
          roomRate,
          transportCost,
          commuteTime,
          timeValue
        );
        totalCost = costBreakdown.totalCost;
      }

      const recommendation: HotelRecommendation = {
        hotelId: hotel.id,
        name: hotel.nameEN || hotel.nameCN, // 优先显示英文名称
        roomRate,
        tier,
        locationScore: locationScore as LocationScore,
        totalCost,
        costBreakdown,
        recommendationReason: defaultReason,
        distanceToCenter: hotel.distance_meters,
      };
      
      recommendations.push(recommendation);
    }

    // 如果启用了隐形成本计算，按综合成本排序
    if (request.includeHiddenCost) {
      recommendations.sort((a, b) => {
        const costA = a.totalCost ?? a.roomRate ?? Infinity;
        const costB = b.totalCost ?? b.roomRate ?? Infinity;
        return costA - costB;
      });
    }

    return recommendations;
  }

  /**
   * 推荐酒店选项（三个区域选项）
   * 
   * 返回三个选项供用户选择：
   * 1. 核心方便区（CONVENIENT）- 市中心，3星，交通便利
   * 2. 舒适享受区（COMFORTABLE）- 偏远，4-5星，体验好
   * 3. 极限省钱区（BUDGET）- 价格最低，可能偏远
   */
  async recommendHotelOptions(
    request: HotelRecommendationRequest
  ): Promise<{
    options: Array<{
      id: 'CONVENIENT' | 'COMFORTABLE' | 'BUDGET';
      name: string;
      description: string;
      pros: string[];
      cons: string[];
      hotels: HotelRecommendation[];
    }>;
    recommendation?: string;
    densityAnalysis?: {
      density: 'HIGH' | 'MEDIUM' | 'LOW';
      avgPlacesPerDay: number;
      totalDays: number;
      totalAttractions: number;
    };
  }> {
    // 获取景点列表
    const attractions = await this.getAttractions(request);
    
    if (attractions.length === 0) {
      throw new NotFoundException('未找到景点信息，无法推荐酒店');
    }

    // 分析行程密度（如果有 tripId）
    let densityAnalysis = null;
    let recommendation = null;
    
    // 如果时间价值未指定且提供了 tripId，自动计算时间价值
    let timeValue = request.timeValuePerHour;
    if (!timeValue && request.tripId) {
      try {
        timeValue = await TimeValueCalculator.calculateFromTrip(
          request.tripId,
          this.prisma
        );
      } catch (error) {
        timeValue = 50; // 默认值
      }
    }

    if (request.tripId) {
      densityAnalysis = await this.calculateTripDensity(request.tripId);
      const autoSelection = await this.autoSelectStrategy(densityAnalysis);
      recommendation = autoSelection.reason;
    }

    // 更新请求中的时间价值
    const updatedRequest = {
      ...request,
      timeValuePerHour: timeValue || request.timeValuePerHour || 50,
    };

    // 选项1：核心方便区（CONVENIENT）
    const convenientRequest: HotelRecommendationRequest = {
      ...updatedRequest,
      strategy: HotelRecommendationStrategy.CENTROID,
      minTier: 3,
      maxTier: 3, // 限制3星
    };
    const convenientHotels = await this.recommendByCentroid(attractions, convenientRequest);

    // 选项2：舒适享受区（COMFORTABLE）
    const comfortableRequest: HotelRecommendationRequest = {
      ...updatedRequest,
      strategy: HotelRecommendationStrategy.RESORT,
      minTier: 4, // 4-5星
    };
    const comfortableHotels = await this.recommendByResort(attractions, comfortableRequest);

    // 选项3：极限省钱区（BUDGET）
    const budgetRequest: HotelRecommendationRequest = {
      ...updatedRequest,
      strategy: HotelRecommendationStrategy.CENTROID,
      minTier: 2, // 2-3星
      maxTier: 3,
    };
    const budgetHotels = await this.recommendByCentroid(attractions, budgetRequest);
    
    // 按价格排序（最便宜的在前）
    const sortedBudgetHotels = [...budgetHotels].sort((a, b) => {
      const costA = a.totalCost ?? a.roomRate ?? Infinity;
      const costB = b.totalCost ?? b.roomRate ?? Infinity;
      return costA - costB;
    });

    // 生成选项描述
    const options = [
      {
        id: 'CONVENIENT' as const,
        name: '核心方便区',
        description: '住在市中心，出门就是地铁，交通便利',
        pros: [
          '交通便利，节省通勤时间',
          '距离景点近，减少奔波',
          '周边设施完善，购物餐饮方便',
        ],
        cons: [
          '房间可能较小',
          '预算内可能只能住 3 星级',
          '价格相对较高',
        ],
        hotels: convenientHotels.slice(0, 10), // 返回前10个
      },
      {
        id: 'COMFORTABLE' as const,
        name: '舒适享受区',
        description: '房间大，档次高，适合休闲度假',
        pros: [
          '房间宽敞，设施完善',
          '星级高，服务好',
          '环境优美，适合放松',
        ],
        cons: [
          '距离市区较远',
          '每天去市区需坐车 40 分钟以上',
          '价格较高',
        ],
        hotels: comfortableHotels.slice(0, 10),
      },
      {
        id: 'BUDGET' as const,
        name: '极限省钱区',
        description: '价格极低，适合预算有限的旅行者',
        pros: [
          '价格最低',
          '性价比高',
          '节省预算用于其他消费',
        ],
        cons: [
          '可能距离景点较远',
          '每天通勤 1 小时以上',
          '设施和服务可能一般',
        ],
        hotels: sortedBudgetHotels.slice(0, 10),
      },
    ];

    return {
      options,
      recommendation: recommendation || undefined,
      densityAnalysis: densityAnalysis || undefined,
    };
  }
}

