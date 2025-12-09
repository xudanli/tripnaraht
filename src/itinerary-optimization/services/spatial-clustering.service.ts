// src/itinerary-optimization/services/spatial-clustering.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlaceNode, Zone } from '../interfaces/route-optimization.interface';

/**
 * 空间聚类服务
 * 
 * 使用 PostGIS 实现 DBSCAN 聚类算法
 * 将物理距离相近的地点打包成"游玩区（Zone）"
 */
@Injectable()
export class SpatialClusteringService {
  private readonly logger = new Logger(SpatialClusteringService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 对地点进行空间聚类
   * 
   * 使用 PostGIS 的 ST_ClusterDBSCAN 函数实现 DBSCAN 聚类
   * 
   * @param places 地点列表
   * @param epsilon 聚类半径（米），默认 2000 米（2公里）
   * @param minPoints 最小聚类点数，默认 2
   * @returns 聚类结果（Zone 列表）
   */
  async clusterPlaces(
    places: PlaceNode[],
    epsilon: number = 2000,
    minPoints: number = 2
  ): Promise<Zone[]> {
    if (places.length === 0) {
      return [];
    }

    // 如果地点数量少于最小聚类点数，返回单个 Zone
    if (places.length < minPoints) {
      return [
        {
          id: 0,
          centroid: this.calculateCentroid(places),
          places: places,
          radius: epsilon,
        },
      ];
    }

    try {
      // 使用 PostGIS 的 ST_ClusterDBSCAN 进行聚类
      // 注意：需要先创建临时表或使用 CTE
      const placeIds = places.map((p) => p.id);
      const lats = places.map((p) => p.location.lat);
      const lngs = places.map((p) => p.location.lng);

      // 构建动态 SQL（使用 Prisma 的 $queryRawUnsafe 或简化处理）
      // 由于 Prisma 的限制，这里使用简化的 K-Means 聚类
      // 实际生产环境可以创建临时表或使用存储过程
      this.logger.debug('使用简化 K-Means 聚类（PostGIS 聚类需要临时表）');
      return this.simpleKMeansClustering(places, epsilon);
    } catch (error) {
      this.logger.error('空间聚类失败，使用简化 K-Means 聚类', error);
      return this.simpleKMeansClustering(places, epsilon);
    }
  }

  /**
   * 简化的 K-Means 聚类（降级方案）
   */
  private simpleKMeansClustering(places: PlaceNode[], epsilon: number): Zone[] {
    const zones: Zone[] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < places.length; i++) {
      if (assigned.has(places[i].id)) continue;

      const zone: PlaceNode[] = [places[i]];
      assigned.add(places[i].id);

      // 找到距离在 epsilon 内的所有点
      for (let j = i + 1; j < places.length; j++) {
        if (assigned.has(places[j].id)) continue;

        const distance = this.calculateDistance(
          places[i].location,
          places[j].location
        );

        if (distance <= epsilon) {
          zone.push(places[j]);
          assigned.add(places[j].id);
        }
      }

      zones.push({
        id: zones.length,
        centroid: this.calculateCentroid(zone),
        places: zone,
        radius: this.calculateZoneRadius(zone),
      });
    }

    return zones;
  }

  /**
   * 计算区域中心点
   */
  private calculateCentroid(places: PlaceNode[]): { lat: number; lng: number } {
    if (places.length === 0) {
      return { lat: 0, lng: 0 };
    }

    const sumLat = places.reduce((sum, p) => sum + p.location.lat, 0);
    const sumLng = places.reduce((sum, p) => sum + p.location.lng, 0);

    return {
      lat: sumLat / places.length,
      lng: sumLng / places.length,
    };
  }

  /**
   * 计算区域半径
   */
  private calculateZoneRadius(places: PlaceNode[]): number {
    if (places.length <= 1) {
      return 0;
    }

    const centroid = this.calculateCentroid(places);
    let maxDistance = 0;

    for (const place of places) {
      const distance = this.calculateDistance(centroid, place.location);
      maxDistance = Math.max(maxDistance, distance);
    }

    return maxDistance;
  }

  /**
   * 找到最近的 Zone
   */
  private findNearestZone(
    place: PlaceNode,
    zones: PlaceNode[][]
  ): PlaceNode[] | null {
    if (zones.length === 0) return null;

    let minDistance = Infinity;
    let nearestZone: PlaceNode[] | null = null;

    for (const zone of zones) {
      const centroid = this.calculateCentroid(zone);
      const distance = this.calculateDistance(centroid, place.location);

      if (distance < minDistance) {
        minDistance = distance;
        nearestZone = zone;
      }
    }

    return nearestZone;
  }

  /**
   * 计算两点间距离（米）
   * 使用 Haversine 公式
   */
  private calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371000; // 地球半径（米）
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.lat)) *
        Math.cos(this.toRadians(point2.lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

