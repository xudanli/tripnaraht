// src/trails/services/trail-support-services.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface TrailSupportService {
  type: 'EQUIPMENT' | 'INSURANCE' | 'SUPPLY' | 'ACCOMMODATION' | 'EMERGENCY';
  name: string;
  description: string;
  location?: { lat: number; lng: number };
  distanceKm?: number;
  recommendation?: string;
  metadata?: any;
}

@Injectable()
export class TrailSupportServicesService {
  constructor(private prisma: PrismaService) {}

  /**
   * 根据徒步路线推荐配套服务
   * 
   * 1. 装备推荐：根据难度和海拔推荐装备
   * 2. 保险推荐：高海拔路线推荐高原反应保险
   * 3. 补给点：推荐沿途的餐饮、住宿
   * 4. 应急服务：医疗点、避难所
   */
  async recommendSupportServices(trailId: number): Promise<TrailSupportService[]> {
    const trail = await this.prisma.trail.findUnique({
      where: { id: trailId },
      include: {
        startPlace: true,
        endPlace: true,
        waypoints: {
          include: {
            place: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!trail) {
      throw new Error(`Trail ${trailId} not found`);
    }

    const services: TrailSupportService[] = [];

    // 1. 装备推荐
    const equipmentRecommendations = this.recommendEquipment(trail);
    services.push(...equipmentRecommendations);

    // 2. 保险推荐
    const insuranceRecommendations = this.recommendInsurance(trail);
    services.push(...insuranceRecommendations);

    // 3. 补给点推荐
    const supplyPoints = await this.recommendSupplyPoints(trail);
    services.push(...supplyPoints);

    // 4. 应急服务
    const emergencyServices = await this.recommendEmergencyServices(trail);
    services.push(...emergencyServices);

    return services;
  }

  /**
   * 推荐装备
   */
  private recommendEquipment(trail: any): TrailSupportService[] {
    const services: TrailSupportService[] = [];
    const difficulty = trail.difficultyLevel;
    const maxElevation = trail.maxElevationM || 0;
    const elevationGain = trail.elevationGainM || 0;

    // 基础装备（所有路线都需要）
    services.push({
      type: 'EQUIPMENT',
      name: '基础徒步装备',
      description: '徒步鞋、背包、水壶、头灯、地图/导航设备',
      recommendation: '所有徒步路线必备',
    });

    // 根据难度推荐
    if (difficulty === 'HARD' || difficulty === 'EXTREME') {
      services.push({
        type: 'EQUIPMENT',
        name: '专业徒步装备',
        description: '登山杖、护膝、冲锋衣、速干衣、急救包',
        recommendation: '高难度路线强烈推荐',
      });
    }

    // 根据海拔推荐
    if (maxElevation > 3000) {
      services.push({
        type: 'EQUIPMENT',
        name: '高海拔装备',
        description: '保暖衣物、防晒霜、太阳镜、防高反药物',
        recommendation: '高海拔路线必需',
      });
    }

    // 根据爬升推荐
    if (elevationGain > 1000) {
      services.push({
        type: 'EQUIPMENT',
        name: '爬升辅助装备',
        description: '登山杖、护膝、抓地力强的徒步鞋',
        recommendation: '大爬升路线推荐',
      });
    }

    return services;
  }

  /**
   * 推荐保险
   */
  private recommendInsurance(trail: any): TrailSupportService[] {
    const services: TrailSupportService[] = [];
    const maxElevation = trail.maxElevationM || 0;
    const difficulty = trail.difficultyLevel;

    // 高海拔保险
    if (maxElevation > 3000) {
      services.push({
        type: 'INSURANCE',
        name: '高原反应保险',
        description: '覆盖高海拔徒步、高原反应、紧急救援的专项保险',
        recommendation: '高海拔路线强烈推荐购买',
        metadata: {
          coverage: ['高原反应', '紧急救援', '医疗转运'],
          recommendedProviders: ['平安保险', '中国人保'],
        },
      });
    }

    // 高难度路线保险
    if (difficulty === 'EXTREME' || difficulty === 'HARD') {
      services.push({
        type: 'INSURANCE',
        name: '户外运动保险',
        description: '覆盖高风险户外运动、意外伤害、紧急救援',
        recommendation: '高难度路线必需',
        metadata: {
          coverage: ['意外伤害', '紧急救援', '医疗费用'],
          recommendedProviders: ['美亚保险', '安联保险'],
        },
      });
    }

    return services;
  }

  /**
   * 推荐补给点（沿途的餐饮、住宿）
   */
  private async recommendSupplyPoints(trail: any): Promise<TrailSupportService[]> {
    const services: TrailSupportService[] = [];

    // 查找起点和终点附近的餐饮、住宿
    const placeIds = [
      trail.startPlaceId,
      trail.endPlaceId,
      ...trail.waypoints.map((wp: any) => wp.placeId).filter(Boolean),
    ].filter(Boolean) as number[];

    if (placeIds.length > 0) {
      const places = await this.prisma.place.findMany({
        where: {
          id: { in: placeIds },
        },
        select: {
          id: true,
          nameCN: true,
          nameEN: true,
          category: true,
        },
      });

      // 使用 raw query 获取 location
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
          
          return {
            ...place,
            location: locationResult[0] ? {
              lat: locationResult[0].lat,
              lng: locationResult[0].lng,
            } : null,
          };
        })
      );

      // 查找这些地点附近的餐饮和住宿
      for (const place of placesWithLocation) {
        const coords = place.location as { lat?: number; lng?: number } | null;
        if (coords && coords.lat && coords.lng) {
          // 查找3km内的餐饮
          const nearbyRestaurants = await this.findNearbyPlaces(
            coords.lat,
            coords.lng,
            3,
            ['RESTAURANT', 'CAFE', 'FOOD']
          );

          nearbyRestaurants.forEach(rest => {
            const restCoords = this.extractCoordinates(rest.location);
            if (restCoords.lat && restCoords.lng && coords.lat && coords.lng) {
              services.push({
                type: 'SUPPLY',
                name: rest.nameCN || rest.nameEN || '餐饮点',
                description: '补给点：可在此用餐、休息',
                location: { lat: restCoords.lat, lng: restCoords.lng },
                distanceKm: this.haversineDistance(
                  coords.lat,
                  coords.lng,
                  restCoords.lat,
                  restCoords.lng
                ),
                recommendation: `距离${place.nameCN || place.nameEN}较近的补给点`,
              });
            }
          });
        }
      }
    }

    return services;
  }

  /**
   * 推荐应急服务（医疗点、避难所）
   */
  private async recommendEmergencyServices(trail: any): Promise<TrailSupportService[]> {
    const services: TrailSupportService[] = [];

    // 获取轨迹中心点
    const trailPoints = await this.extractTrailPoints(trail);
    if (trailPoints.length > 0) {
      const centerIndex = Math.floor(trailPoints.length / 2);
      const center = trailPoints[centerIndex];

      // 查找10km内的医疗点
      const hospitals = await this.findNearbyPlaces(
        center.lat,
        center.lng,
        10,
        ['HOSPITAL', 'CLINIC', 'PHARMACY']
      );

      hospitals.forEach(hosp => {
        const coords = this.extractCoordinates(hosp.location);
        if (coords.lat && coords.lng) {
          services.push({
            type: 'EMERGENCY',
            name: hosp.nameCN || hosp.nameEN || '医疗点',
            description: '应急医疗点',
            location: { lat: coords.lat, lng: coords.lng },
            distanceKm: this.haversineDistance(
              center.lat,
              center.lng,
              coords.lat,
              coords.lng
            ),
            recommendation: '紧急情况可前往',
          });
        }
      });
    }

    return services;
  }

  // ========== 辅助方法 ==========

  private extractCoordinates(location: any): { lat?: number; lng?: number } {
    if (!location) return {};
    
    if (typeof location === 'string') {
      const match = location.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
      if (match) {
        return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
      }
    }
    
    if (typeof location === 'object') {
      if ('lat' in location && 'lng' in location) {
        return { lat: location.lat, lng: location.lng };
      }
      if ('latitude' in location && 'longitude' in location) {
        return { lat: location.latitude, lng: location.longitude };
      }
    }
    
    return {};
  }

  private async extractTrailPoints(trail: any): Promise<Array<{ lat: number; lng: number }>> {
    if (trail.gpxData) {
      try {
        const gpx = typeof trail.gpxData === 'string' 
          ? JSON.parse(trail.gpxData) 
          : trail.gpxData;
        
        if (gpx.points && Array.isArray(gpx.points)) {
          return gpx.points.map((p: any) => ({
            lat: p.lat,
            lng: p.lng,
          }));
        }
      } catch (e) {
        // 忽略
      }
    }

    const points: Array<{ lat: number; lng: number }> = [];
    
    // 从startPlace获取位置
    if (trail.startPlaceId) {
      const startLocation = await this.prisma.$queryRaw<Array<{
        lat: number;
        lng: number;
      }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.startPlaceId}
      `;
      
      if (startLocation[0]) {
        points.push({ lat: startLocation[0].lat, lng: startLocation[0].lng });
      }
    }
    
    // 从endPlace获取位置
    if (trail.endPlaceId) {
      const endLocation = await this.prisma.$queryRaw<Array<{
        lat: number;
        lng: number;
      }>>`
        SELECT 
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE id = ${trail.endPlaceId}
      `;
      
      if (endLocation[0]) {
        points.push({ lat: endLocation[0].lat, lng: endLocation[0].lng });
      }
    }

    return points;
  }

  private async findNearbyPlaces(
    lat: number,
    lng: number,
    radiusKm: number,
    categories: string[]
  ): Promise<any[]> {
    const radiusMeters = radiusKm * 1000;

    try {
      // 使用PostGIS空间查询
      // 构建动态SQL（注意：需要安全处理，避免SQL注入）
      if (categories.length === 0) {
        return [];
      }

      // 构建category数组的SQL（使用Prisma.raw安全处理）
      const categorySql = categories.map(c => `'${c}'`).join(', ');

      const places = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        category: string;
        rating: number | null;
        distance_meters: number;
        lat: number;
        lng: number;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category,
          p.rating,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_meters
        FROM "Place" p
        WHERE 
          p.location IS NOT NULL
          AND p.category = ANY(ARRAY[${Prisma.raw(categorySql)}]::"PlaceCategory"[])
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY distance_meters ASC
        LIMIT 20
      `;

      // 转换结果格式，添加location字段
      return places.map(p => ({
        id: p.id,
        nameCN: p.nameCN,
        nameEN: p.nameEN,
        category: p.category,
        rating: p.rating,
        location: {
          lat: p.lat,
          lng: p.lng,
        },
      }));
    } catch (error) {
      // 如果PostGIS查询失败，返回空数组
      console.error('PostGIS空间查询失败:', error);
      return [];
    }
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

