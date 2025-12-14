// src/planning-policy/services/place-to-poi-helper.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Poi } from '../interfaces/poi.interface';
import { PlaceToPoiService } from './place-to-poi.service';

/**
 * Place 到 Poi 的查询辅助服务
 * 
 * 提供便捷方法从数据库查询 Place 并转换为 Poi
 */
@Injectable()
export class PlaceToPoiHelperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placeToPoiService: PlaceToPoiService
  ) {}

  /**
   * 根据 ID 查询并转换为 Poi
   */
  async getPoiById(placeId: number): Promise<Poi | null> {
    const place = await this.prisma.$queryRaw<
      Array<{ id: number; lat: number; lng: number; [key: string]: any }>
    >`
      SELECT 
        p.*,
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng
      FROM "Place" p
      WHERE p.id = ${placeId}
      LIMIT 1
    `;

    if (!place || place.length === 0) {
      return null;
    }

    return this.placeToPoiService.convert(place[0] as any);
  }

  /**
   * 根据多个 ID 批量查询并转换为 Poi 数组
   */
  async getPoisByIds(placeIds: number[]): Promise<Poi[]> {
    if (placeIds.length === 0) {
      return [];
    }

    const places = await this.prisma.$queryRaw<
      Array<{ id: number; lat: number; lng: number; [key: string]: any }>
    >`
      SELECT 
        p.*,
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng
      FROM "Place" p
      WHERE p.id = ANY(${placeIds}::int[])
    `;

    return this.placeToPoiService.convertBatch(places as any);
  }

  /**
   * 根据条件查询并转换为 Poi 数组
   * 
   * @param where - Prisma where 条件
   * @param limit - 限制数量
   */
  async getPoisByCondition(
    where: any,
    limit?: number
  ): Promise<Poi[]> {
    // 先查询 ID
    const places = await this.prisma.place.findMany({
      where,
      select: { id: true },
      take: limit,
    });

    const placeIds = places.map((p) => p.id);
    if (placeIds.length === 0) {
      return [];
    }

    // 使用批量查询（带 lat/lng）
    return this.getPoisByIds(placeIds);
  }

  /**
   * 创建 PoiLookup（用于 What-If 评估）
   * 
   * @param placeIds - Place ID 数组
   * @returns PoiLookup 实现
   */
  async createPoiLookup(placeIds: number[]): Promise<{
    getPoiById: (id: string) => Poi | undefined;
  }> {
    const pois = await this.getPoisByIds(placeIds);
    const poiMap = new Map<string, Poi>();
    for (const poi of pois) {
      poiMap.set(poi.id, poi);
    }

    return {
      getPoiById: (id: string) => poiMap.get(id),
    };
  }
}
