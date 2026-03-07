/**
 * Travel World Model Phase 3: District Service
 *
 * 城市区域模型：CRUD、按 City 查询、Point-in-District
 * 降级：无 District 数据时跳过约束，不阻塞决策
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface DistrictInfo {
  id: number;
  cityId: number;
  name: string;
  nameCN?: string | null;
  nameEN?: string | null;
  radiusM?: number | null;
  dominantExperience?: string | null;
  vibe?: string[] | null;
}

@Injectable()
export class DistrictService {
  private readonly logger = new Logger(DistrictService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按城市查询所有 District
   */
  async findByCityId(cityId: number): Promise<DistrictInfo[]> {
    const list = await this.prisma.district.findMany({
      where: { cityId },
      orderBy: { name: 'asc' },
    });
    return list.map(this.toInfo);
  }

  /**
   * 按城市 ID 列表批量查询 District
   */
  async findByCityIds(cityIds: number[]): Promise<Map<number, DistrictInfo[]>> {
    if (cityIds.length === 0) return new Map();
    const list = await this.prisma.district.findMany({
      where: { cityId: { in: cityIds } },
      orderBy: { name: 'asc' },
    });
    const map = new Map<number, DistrictInfo[]>();
    for (const d of list) {
      const arr = map.get(d.cityId) ?? [];
      arr.push(this.toInfo(d));
      map.set(d.cityId, arr);
    }
    return map;
  }

  /**
   * 根据经纬度判断点所属 District（基于 center + radiusM 圆形）
   * 若无 center/radiusM，跳过该 District
   * @returns districtId 或 null
   */
  async findDistrictAtPoint(cityId: number, lat: number, lng: number): Promise<number | null> {
    const districts = await this.prisma.$queryRaw<
      Array<{ id: number; radius_m: number | null; st_x: number; st_y: number }>
    >`
      SELECT id, "radiusM" as radius_m,
        ST_X(center::geometry) as st_x,
        ST_Y(center::geometry) as st_y
      FROM "District"
      WHERE "cityId" = ${cityId}
        AND center IS NOT NULL
        AND "radiusM" IS NOT NULL
    `;

    for (const d of districts) {
      const distM = this.haversineM(lat, lng, d.st_y, d.st_x);
      if (distM <= (d.radius_m ?? Infinity)) {
        return d.id;
      }
    }
    return null;
  }

  /**
   * 批量判断点所属 District（优化：一次查所有 District，内存计算）
   */
  async findDistrictsForPlaces(
    cityId: number,
    points: Array<{ placeId: number; lat: number; lng: number }>,
  ): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    if (points.length === 0) return result;

    const districts = await this.prisma.$queryRaw<
      Array<{ id: number; radius_m: number | null; st_x: number; st_y: number }>
    >`
      SELECT id, "radiusM" as radius_m,
        ST_X(center::geometry) as st_x,
        ST_Y(center::geometry) as st_y
      FROM "District"
      WHERE "cityId" = ${cityId}
        AND center IS NOT NULL
        AND "radiusM" IS NOT NULL
    `;

    if (districts.length === 0) return result;

    for (const p of points) {
      for (const d of districts) {
        const distM = this.haversineM(p.lat, p.lng, d.st_y, d.st_x);
        if (distM <= (d.radius_m ?? Infinity)) {
          result.set(p.placeId, d.id);
          break;
        }
      }
    }
    return result;
  }

  /**
   * 获取 Place 的 districtId（优先从 DB，否则按 location 计算）
   */
  async getDistrictIdForPlace(placeId: number, lat?: number, lng?: number): Promise<number | null> {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { districtId: true, cityId: true },
    });
    if (!place) return null;
    if (place.districtId != null) return place.districtId;
    if (!place.cityId) return null;

    let pointLat = lat;
    let pointLng = lng;
    if (pointLat == null || pointLng == null) {
      const coords = await this.prisma.$queryRaw<Array<{ st_x: number; st_y: number }>>`
        SELECT ST_X(location::geometry) as st_x, ST_Y(location::geometry) as st_y
        FROM "Place" WHERE id = ${placeId} AND location IS NOT NULL
      `;
      if (coords[0]) {
        pointLng = coords[0].st_x;
        pointLat = coords[0].st_y;
      }
    }
    if (pointLat == null || pointLng == null) return null;

    return this.findDistrictAtPoint(place.cityId, pointLat, pointLng);
  }

  private async distanceFromCenterKm(districtId: number, lat: number, lng: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ dist_km: number }>
    >(Prisma.sql`
      SELECT ST_Distance(
        center::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) / 1000.0 as dist_km
      FROM "District"
      WHERE id = ${districtId} AND center IS NOT NULL
    `);
    return rows[0]?.dist_km ?? null;
  }

  private haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  private toInfo(d: {
    id: number;
    cityId: number;
    name: string;
    nameCN?: string | null;
    nameEN?: string | null;
    radiusM?: number | null;
    dominantExperience?: string | null;
    vibe?: unknown;
  }): DistrictInfo {
    const vibe = d.vibe as string[] | null | undefined;
    return {
      id: d.id,
      cityId: d.cityId,
      name: d.name,
      nameCN: d.nameCN ?? undefined,
      nameEN: d.nameEN ?? undefined,
      radiusM: d.radiusM ?? undefined,
      dominantExperience: d.dominantExperience ?? undefined,
      vibe: Array.isArray(vibe) ? vibe : undefined,
    };
  }
}
