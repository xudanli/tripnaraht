// src/trips/readiness/services/poi-trailhead.service.ts

/**
 * POI 徒步入口识别服务
 * 
 * 识别和配对徒步入口点与停车点
 * 适用于斯瓦尔巴等需要徒步活动的场景
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface TrailAccessPoint {
  trailheadId: string;
  trailheadName: string;
  trailheadLat: number;
  trailheadLng: number;
  parkingId: string | null;
  parkingName: string | null;
  parkingLat: number | null;
  parkingLng: number | null;
  parkingDistanceM: number | null;
  informationPointId: string | null;
  informationPointName: string | null;
  pathConnections: number; // 连接的步道数量
}

@Injectable()
export class POITrailheadService {
  private readonly logger = new Logger(POITrailheadService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查找徒步入口点（带停车点和信息点配对）
   * 
   * @param lat 中心点纬度
   * @param lng 中心点经度
   * @param radiusKm 搜索半径（公里），默认 25km
   */
  async findTrailAccessPoints(
    lat: number,
    lng: number,
    radiusKm: number = 25
  ): Promise<TrailAccessPoint[]> {
    try {
      const radiusM = radiusKm * 1000;
      
      // 1. 查找主要徒步入口（highway=trailhead）
      const primaryTrailheads = await this.findPrimaryTrailheads(lat, lng, radiusM);
      
      // 2. 如果不足，补充信息点附近的入口
      const secondaryTrailheads = await this.findSecondaryTrailheads(lat, lng, radiusM);
      
      // 合并并去重
      const allTrailheads = [...primaryTrailheads, ...secondaryTrailheads];
      const uniqueTrailheads = this.deduplicateTrailheads(allTrailheads);
      
      // 3. 为每个入口点配对停车点和信息点
      const accessPoints = await Promise.all(
        uniqueTrailheads.map(trailhead => this.enrichTrailhead(trailhead))
      );
      
      return accessPoints;
    } catch (error) {
      this.logger.error(`查找徒步入口失败 (${lat}, ${lng}):`, error);
      return [];
    }
  }

  /**
   * 查找主要徒步入口（highway=trailhead）
   */
  private async findPrimaryTrailheads(
    lat: number,
    lng: number,
    radiusM: number
  ): Promise<Array<{
    poiId: string;
    name: string;
    lat: number;
    lng: number;
  }>> {
    const result = await (this.prisma as any).$queryRawUnsafe(`
      SELECT 
        poi_id,
        name_default,
        lat,
        lng
      FROM poi_canonical
      WHERE geom IS NOT NULL
        AND category = 'TRAILHEAD'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        );
    `) as Array<{
      poi_id: string;
      name_default: string;
      lat: number;
      lng: number;
    }>;

    return result.map(row => ({
      poiId: row.poi_id,
      name: row.name_default || '未命名',
      lat: row.lat,
      lng: row.lng,
    }));
  }

  /**
   * 查找次要徒步入口（tourism=information + 附近有步道）
   */
  private async findSecondaryTrailheads(
    lat: number,
    lng: number,
    radiusM: number
  ): Promise<Array<{
    poiId: string;
    name: string;
    lat: number;
    lng: number;
  }>> {
    // 查找信息点，且附近 50m 内有步道
    const result = await (this.prisma as any).$queryRawUnsafe(`
      SELECT DISTINCT
        p.poi_id,
        p.name_default,
        p.lat,
        p.lng
      FROM poi_canonical p
      WHERE p.geom IS NOT NULL
        AND p.category = 'INFORMATION'
        AND ST_DWithin(
          p.geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
        AND EXISTS (
          SELECT 1
          FROM geo_roads r
          WHERE r.geom IS NOT NULL
            AND ST_GeometryType(r.geom) IN ('ST_LineString', 'ST_MultiLineString')
            AND (
              r.properties->>'highway' IN ('path', 'footway', 'track', 'bridleway')
              OR r.properties->>'highway' LIKE '%path%'
            )
            AND ST_DWithin(
              r.geom::geography,
              p.geom::geography,
              50
            )
        );
    `) as Array<{
      poi_id: string;
      name_default: string;
      lat: number;
      lng: number;
    }>;

    return result.map(row => ({
      poiId: row.poi_id,
      name: row.name_default || '未命名',
      lat: row.lat,
      lng: row.lng,
    }));
  }

  /**
   * 去重徒步入口
   */
  private deduplicateTrailheads(
    trailheads: Array<{ poiId: string; name: string; lat: number; lng: number }>
  ): Array<{ poiId: string; name: string; lat: number; lng: number }> {
    const seen = new Set<string>();
    const unique: Array<{ poiId: string; name: string; lat: number; lng: number }> = [];
    
    for (const trailhead of trailheads) {
      if (!seen.has(trailhead.poiId)) {
        seen.add(trailhead.poiId);
        unique.push(trailhead);
      }
    }
    
    return unique;
  }

  /**
   * 丰富徒步入口信息（配对停车点和信息点）
   */
  private async enrichTrailhead(
    trailhead: { poiId: string; name: string; lat: number; lng: number }
  ): Promise<TrailAccessPoint> {
    // 查找最近的停车点（50m 内）
    const parking = await this.findNearestParking(trailhead.lat, trailhead.lng, 50);
    
    // 查找信息点（如果入口本身不是信息点）
    const information = await this.findNearestInformation(trailhead.lat, trailhead.lng, 100);
    
    // 计算连接的步道数量
    const pathConnections = await this.countPathConnections(trailhead.lat, trailhead.lng, 50);
    
    return {
      trailheadId: trailhead.poiId,
      trailheadName: trailhead.name,
      trailheadLat: trailhead.lat,
      trailheadLng: trailhead.lng,
      parkingId: parking?.poiId || null,
      parkingName: parking?.name || null,
      parkingLat: parking?.lat || null,
      parkingLng: parking?.lng || null,
      parkingDistanceM: parking?.distanceM || null,
      informationPointId: information?.poiId || null,
      informationPointName: information?.name || null,
      pathConnections,
    };
  }

  /**
   * 查找最近的停车点
   */
  private async findNearestParking(
    lat: number,
    lng: number,
    maxDistanceM: number
  ): Promise<{ poiId: string; name: string; lat: number; lng: number; distanceM: number } | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          poi_id,
          name_default,
          lat,
          lng,
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND (
            tags_slim->>'amenity' = 'parking'
            OR tags_slim->>'parking' IS NOT NULL
          )
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${maxDistanceM}
          )
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `) as Array<{
        poi_id: string;
        name_default: string;
        lat: number;
        lng: number;
        distance_m: number;
      }>;

      if (result && result.length > 0) {
        return {
          poiId: result[0].poi_id,
          name: result[0].name_default || '未命名',
          lat: result[0].lat,
          lng: result[0].lng,
          distanceM: Math.round(result[0].distance_m),
        };
      }
      return null;
    } catch (error) {
      this.logger.warn(`查找停车点失败:`, error);
      return null;
    }
  }

  /**
   * 查找最近的信息点
   */
  private async findNearestInformation(
    lat: number,
    lng: number,
    maxDistanceM: number
  ): Promise<{ poiId: string; name: string } | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          poi_id,
          name_default
        FROM poi_canonical
        WHERE geom IS NOT NULL
          AND category = 'INFORMATION'
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${maxDistanceM}
          )
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `) as Array<{
        poi_id: string;
        name_default: string;
      }>;

      if (result && result.length > 0) {
        return {
          poiId: result[0].poi_id,
          name: result[0].name_default || '未命名',
        };
      }
      return null;
    } catch (error) {
      this.logger.warn(`查找信息点失败:`, error);
      return null;
    }
  }

  /**
   * 计算连接的步道数量
   */
  private async countPathConnections(
    lat: number,
    lng: number,
    radiusM: number
  ): Promise<number> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT COUNT(*) as count
        FROM geo_roads
        WHERE geom IS NOT NULL
          AND ST_GeometryType(geom) IN ('ST_LineString', 'ST_MultiLineString')
          AND (
            properties->>'highway' IN ('path', 'footway', 'track', 'bridleway')
            OR properties->>'highway' LIKE '%path%'
          )
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusM}
          );
      `) as Array<{ count: bigint }>;

      return result && result.length > 0 ? Number(result[0].count) : 0;
    } catch (error) {
      this.logger.warn(`计算步道连接失败:`, error);
      return 0;
    }
  }
}

