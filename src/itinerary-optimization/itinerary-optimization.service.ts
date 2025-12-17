// src/itinerary-optimization/itinerary-optimization.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OptimizeRouteDto } from './dto/optimize-route.dto';
import {
  PlaceNode,
  OptimizationConfig,
} from './interfaces/route-optimization.interface';
import { RouteOptimizerService } from './services/route-optimizer.service';
import { PlaceCategory } from '@prisma/client';
import { PhysicalMetadata } from '../places/interfaces/physical-metadata.interface';

/**
 * 路线优化主服务
 * 
 * 负责从数据库获取地点数据，转换为优化算法需要的格式
 */
@Injectable()
export class RouteOptimizationService {
  constructor(
    private prisma: PrismaService,
    private optimizerService: RouteOptimizerService
  ) {}

  /**
   * 优化路线（主入口）
   */
  async optimizeRoute(dto: OptimizeRouteDto) {
    // 1. 从数据库获取地点数据
    const places = await this.prisma.place.findMany({
      where: {
        id: { in: dto.placeIds },
      },
      include: {
        city: true,
      },
    });

    if (places.length === 0) {
      throw new NotFoundException('未找到指定的地点');
    }

    if (places.length !== dto.placeIds.length) {
      const foundIds = places.map((p) => p.id);
      const missingIds = dto.placeIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `以下地点不存在：${missingIds.join(', ')}`
      );
    }

    // 2. 从 PostGIS 获取精确位置（先查询位置）
    const placesWithLocation = await Promise.all(
      places.map(async (place) => {
        const locationResult = await this.prisma.$queryRaw<Array<{
          lat: number;
          lng: number;
        }>>`
          SELECT 
            ST_Y(location::geometry) as lat,
            ST_X(location::geometry) as lng
          FROM "Place"
          WHERE id = ${place.id}
        `;

        if (locationResult.length > 0 && locationResult[0].lat && locationResult[0].lng) {
          return {
            placeId: place.id,
            location: {
              lat: locationResult[0].lat,
              lng: locationResult[0].lng,
            },
          };
        }

        // 降级：从 metadata 中提取位置
        const metadata = (place.metadata as any) || {};
        if (metadata.location) {
          return {
            placeId: place.id,
            location: metadata.location,
          };
        }

        return null;
      })
    );

    // 3. 转换为 PlaceNode 格式
    const placeNodes: PlaceNode[] = places.map((place) => {
      const metadata = (place.metadata as any) || {};
      const physicalMetadata = (place.physicalMetadata as any) || {};

      // 从查询结果中获取位置
      const placeWithLoc = placesWithLocation.find(
        (p) => p && p.placeId === place.id
      );
      const location = placeWithLoc?.location || { lat: 0, lng: 0 };

      // 推断强度等级
      let intensity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
      if (physicalMetadata.intensity_factor) {
        if (physicalMetadata.intensity_factor >= 1.5) intensity = 'HIGH';
        else if (physicalMetadata.intensity_factor <= 0.5) intensity = 'LOW';
      }

      // 判断是否为餐厅
      const isRestaurant = place.category === PlaceCategory.RESTAURANT;

      return {
        id: place.id,
        name: place.nameEN || place.nameCN, // 优先显示英文名称
        category: place.category,
        location,
        physicalMetadata: physicalMetadata as PhysicalMetadata,
        intensity,
        estimatedDuration:
          physicalMetadata.estimated_duration_min || 60,
        openingHours: metadata.openingHours
          ? {
              start: metadata.openingHours.mon?.split('-')[0],
              end: metadata.openingHours.mon?.split('-')[1],
            }
          : undefined,
        isRestaurant,
        isRest: false,
      };
    });

    // 4. 转换为优化配置
    const config: OptimizationConfig = {
      date: dto.config.date,
      startTime: dto.config.startTime,
      endTime: dto.config.endTime,
      pacingFactor: dto.config.pacingFactor || 1.0,
      hasChildren: dto.config.hasChildren || false,
      hasElderly: dto.config.hasElderly || false,
      lunchWindow: dto.config.lunchWindow,
      dinnerWindow: dto.config.dinnerWindow,
      useVRPTW: dto.config.useVRPTW || false,
      clustering: {
        minPoints: 2,
        epsilon: 2000, // 2 公里
      },
    };

    // 5. 调用优化算法
    return this.optimizerService.optimizeRoute(placeNodes, config);
  }
}

