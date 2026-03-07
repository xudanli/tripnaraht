/**
 * Travel World Model - Place Graph Service
 *
 * 查询 Place 间边（walkTime、transitTime）、邻接、Micro Route
 * 降级：无边时回退 haversine 估算
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PlaceEdgeInfo {
  fromPlaceId: number;
  toPlaceId: number;
  distanceM?: number;
  walkTimeMin?: number;
  transitTimeMin?: number;
}

@Injectable()
export class PlaceGraphService {
  private readonly logger = new Logger(PlaceGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取两点间的边信息（walkTime/transitTime）
   * 降级：无边时返回 null，调用方用 haversine 估算
   */
  async getEdge(fromPlaceId: number, toPlaceId: number): Promise<PlaceEdgeInfo | null> {
    if (fromPlaceId === toPlaceId) return null;
    const edge = await this.prisma.placeEdge.findUnique({
      where: {
        fromPlaceId_toPlaceId: { fromPlaceId, toPlaceId },
      },
    });
    if (!edge) return null;
    return {
      fromPlaceId: edge.fromPlaceId,
      toPlaceId: edge.toPlaceId,
      distanceM: edge.distanceM ?? undefined,
      walkTimeMin: edge.walkTimeMin ?? undefined,
      transitTimeMin: edge.transitTimeMin ?? undefined,
    };
  }

  /**
   * 估算步行时间（分钟）
   * 优先使用 PlaceEdge.walkTimeMin，否则按距离估算（5 km/h）
   */
  async getWalkTimeMin(fromPlaceId: number, toPlaceId: number, distanceKm?: number): Promise<number | null> {
    const edge = await this.getEdge(fromPlaceId, toPlaceId);
    if (edge?.walkTimeMin != null) return edge.walkTimeMin;
    if (distanceKm != null && distanceKm > 0) {
      return Math.ceil((distanceKm / 5) * 60); // 5 km/h 步行
    }
    return null;
  }

  /**
   * 批量获取从某 Place 出发的邻接边（用于 RouteOptimization 选点时的距离/时间约束）
   */
  async getOutEdges(fromPlaceId: number, toPlaceIds: number[]): Promise<Map<number, PlaceEdgeInfo>> {
    if (toPlaceIds.length === 0) return new Map();
    const edges = await this.prisma.placeEdge.findMany({
      where: {
        fromPlaceId,
        toPlaceId: { in: toPlaceIds },
      },
    });
    return new Map(edges.map((e) => [e.toPlaceId, { fromPlaceId: e.fromPlaceId, toPlaceId: e.toPlaceId, distanceM: e.distanceM ?? undefined, walkTimeMin: e.walkTimeMin ?? undefined, transitTimeMin: e.transitTimeMin ?? undefined }]));
  }

  /**
   * Haversine 距离（km），供无 PlaceEdge 时降级使用
   */
  haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /**
   * 从距离估算步行时间（5 km/h）
   */
  estimateWalkTimeMinFromKm(distanceKm: number): number {
    return Math.ceil((distanceKm / 5) * 60);
  }
}
