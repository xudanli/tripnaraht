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

@Injectable()
export class HotelRecommendationService {
  constructor(private prisma: PrismaService) {}

  /**
   * 推荐酒店
   * 
   * 根据不同的策略推荐合适的酒店
   */
  async recommendHotels(
    request: HotelRecommendationRequest
  ): Promise<HotelRecommendation[]> {
    // 获取景点列表
    const attractions = await this.getAttractions(request);
    
    if (attractions.length === 0) {
      throw new NotFoundException('未找到景点信息，无法推荐酒店');
    }

    // 根据策略选择算法
    switch (request.strategy) {
      case HotelRecommendationStrategy.CENTROID:
        return this.recommendByCentroid(attractions, request);
      
      case HotelRecommendationStrategy.HUB:
        return this.recommendByHub(attractions, request);
      
      case HotelRecommendationStrategy.RESORT:
        return this.recommendByResort(attractions, request);
      
      default:
        return this.recommendByCentroid(attractions, request);
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
        name: p.name,
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
              name: item.place.name,
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
    // 使用 PostGIS 计算中心点
    const attractionIds = attractions.map((a) => a.id);
    
    // 构建 SQL 查询：计算中心点并找最近的酒店
    // 注意：这里使用简化的查询，实际需要根据数据库结构调整
    const hotels = await this.prisma.place.findMany({
      where: {
        category: PlaceCategory.HOTEL,
      },
      take: 20,
      orderBy: {
        id: 'asc', // 临时排序，实际应该按距离排序
      },
    });

    // 简化实现：返回前20个酒店，实际应该使用 PostGIS 计算距离
    return this.formatRecommendations(
      hotels.map((h) => ({
        id: h.id,
        name: h.name,
        metadata: h.metadata,
        distance_meters: 0, // 需要实际计算
      })),
      request,
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
      .map((h) => {
        const metadata = h.metadata as any;
        const locationScore = metadata?.location_score;
        return {
          hotel: h,
          walkMin: locationScore?.nearest_station_walk_min || 999,
        };
      })
      .sort((a, b) => a.walkMin - b.walkMin)
      .slice(0, 20);

    return this.formatRecommendations(
      sortedHotels.map((item) => ({
        id: item.hotel.id,
        name: item.hotel.name,
        metadata: item.hotel.metadata,
        distance_meters: item.walkMin * 80, // 估算：步行1分钟≈80米
      })),
      request,
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
      take: 50, // 取更多候选
    });

    // 筛选：距离中心 > 5km 且星级 >= 4
    const resortHotels = hotels
      .map((h) => {
        const metadata = h.metadata as any;
        const locationScore = metadata?.location_score;
        const tier = metadata?.hotel_tier || 0;
        return {
          hotel: h,
          centerDistance: locationScore?.center_distance_km || 0,
          tier,
        };
      })
      .filter((item) => item.centerDistance > 5 && item.tier >= 4)
      .sort((a, b) => b.tier - a.tier) // 按星级降序
      .slice(0, 20);

    return this.formatRecommendations(
      resortHotels.map((item) => ({
        id: item.hotel.id,
        name: item.hotel.name,
        metadata: item.hotel.metadata,
        distance_meters: item.centerDistance * 1000,
      })),
      request,
      '度假模式：位于城市边缘，房间大、档次高，适合休闲游'
    );
  }

  /**
   * 格式化推荐结果
   */
  private formatRecommendations(
    hotels: Array<{
      id: number;
      name: string;
      metadata: any;
      distance_meters: number;
    }>,
    request: HotelRecommendationRequest,
    defaultReason: string
  ): HotelRecommendation[] {
    return hotels.map((hotel) => {
      const metadata = hotel.metadata || {};
      const locationScore = metadata.location_score || {};
      const roomRate = metadata.room_rate || metadata.price || 0;
      const tier = metadata.hotel_tier || 0;

      // 计算隐形成本（如果启用）
      let totalCost: number | undefined;
      let costBreakdown: any | undefined;

      if (request.includeHiddenCost && locationScore.nearest_station_walk_min) {
        const distanceKm = hotel.distance_meters / 1000;
        const transportCost = HotelCostCalculator.estimateTransportCost(distanceKm);
        const commuteTime = locationScore.nearest_station_walk_min || 30;
        const timeValue = request.timeValuePerHour || 50;

        costBreakdown = HotelCostCalculator.calculateCostBreakdown(
          roomRate,
          transportCost,
          commuteTime,
          timeValue
        );
        totalCost = costBreakdown.totalCost;
      }

      return {
        hotelId: hotel.id,
        name: hotel.name,
        roomRate,
        tier,
        locationScore: locationScore as LocationScore,
        totalCost,
        costBreakdown,
        recommendationReason: defaultReason,
        distanceToCenter: hotel.distance_meters,
      };
    });
  }
}

