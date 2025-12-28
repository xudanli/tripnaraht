// src/places/services/svalbard-poi-features.service.ts
/**
 * 斯瓦尔巴 POI Features 服务
 * 
 * 为决策层（Abu/Dr.Dre/Neptune）提供结构化的 Geo/POI Features
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface PickupPoint {
  placeId: number;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  pickupScore: number;
  reasons: string[];
  distanceToCoastline?: number;
  tags: Record<string, any>;
}

export interface TrailAccessPoint {
  placeId: number;
  name: string;
  nameEN?: string;
  lat: number;
  lng: number;
  confidence: 'high' | 'medium' | 'low';
  parkingPlaceId?: number;
  distanceToParking?: number;
  tags: Record<string, any>;
}

export interface SvalbardGeoFeatures {
  ports: {
    topPickupPoints: PickupPoint[];
    hasHarbour: boolean;
    totalPorts: number;
  };
  trail: {
    trailheads: TrailAccessPoint[];
    trailAccessPoints: TrailAccessPoint[];
    totalTrailheads: number;
  };
  safety: {
    hospital: boolean;
    clinic: boolean;
    pharmacy: boolean;
    police: boolean;
    fireStation: boolean;
    totalSafetyPoints: number;
  };
  supply: {
    fuel: boolean;
    supermarket: boolean;
    convenience: boolean;
    totalSupplyPoints: number;
  };
  transport: {
    airport: boolean;
    parking: boolean;
    totalTransportPoints: number;
  };
}

@Injectable()
export class SvalbardPoiFeaturesService {
  private readonly logger = new Logger(SvalbardPoiFeaturesService.name);

  /**
   * 获取斯瓦尔巴 Geo/POI Features
   * 
   * 用于决策层（Abu/Dr.Dre/Neptune）的输入
   */
  async getSvalbardFeatures(region: string = 'SVALBARD_LONGYEARBYEN'): Promise<SvalbardGeoFeatures> {
    this.logger.log(`获取 ${region} 的 POI Features...`);

    // 1. 获取码头/出海集合点
    const pickupPoints = await this.getPickupPoints(region);
    
    // 2. 获取徒步入口
    const trailAccessPoints = await this.getTrailAccessPoints(region);
    
    // 3. 获取安全保障点
    const safetyPoints = await this.getSafetyPoints(region);
    
    // 4. 获取补给点
    const supplyPoints = await this.getSupplyPoints(region);
    
    // 5. 获取交通节点
    const transportPoints = await this.getTransportPoints(region);

    return {
      ports: {
        topPickupPoints: pickupPoints.slice(0, 3), // Top 3
        hasHarbour: pickupPoints.length > 0,
        totalPorts: pickupPoints.length,
      },
      trail: {
        trailheads: trailAccessPoints,
        trailAccessPoints: trailAccessPoints,
        totalTrailheads: trailAccessPoints.length,
      },
      safety: {
        hospital: safetyPoints.hospital > 0,
        clinic: safetyPoints.clinic > 0,
        pharmacy: safetyPoints.pharmacy > 0,
        police: safetyPoints.police > 0,
        fireStation: safetyPoints.fireStation > 0,
        totalSafetyPoints: safetyPoints.total,
      },
      supply: {
        fuel: supplyPoints.fuel > 0,
        supermarket: supplyPoints.supermarket > 0,
        convenience: supplyPoints.convenience > 0,
        totalSupplyPoints: supplyPoints.total,
      },
      transport: {
        airport: transportPoints.airport > 0,
        parking: transportPoints.parking > 0,
        totalTransportPoints: transportPoints.total,
      },
    };
  }

  /**
   * 获取码头/出海集合点（按评分排序）
   */
  private async getPickupPoints(region: string): Promise<PickupPoint[]> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND (
          metadata->>'canonicalType' IN ('PORT_FERRY_TERMINAL', 'PORT_PIER', 'PORT_MARINA', 'PORT_DOCK')
          OR metadata->>'pickupScore' IS NOT NULL
        )
      ORDER BY 
        CAST(metadata->>'pickupScore' AS INTEGER) DESC NULLS LAST,
        id
    `;

    return places.map(p => ({
      placeId: p.id,
      name: p.nameCN,
      nameEN: p.nameEN || undefined,
      lat: p.lat,
      lng: p.lng,
      pickupScore: parseInt(p.metadata?.pickupScore || '0'),
      reasons: p.metadata?.pickupReasons?.split('; ') || [],
      distanceToCoastline: p.metadata?.distanceToCoastline
        ? parseFloat(p.metadata.distanceToCoastline)
        : undefined,
      tags: p.metadata?.rawTags || {},
    }));
  }

  /**
   * 获取徒步入口点
   */
  private async getTrailAccessPoints(region: string): Promise<TrailAccessPoint[]> {
    const places = await prisma.$queryRaw<Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      lat: number;
      lng: number;
      metadata: any;
    }>>`
      SELECT 
        id,
        "nameCN",
        "nameEN",
        ST_Y(location::geometry) as lat,
        ST_X(location::geometry) as lng,
        metadata
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' = 'TRAILHEAD'
    `;

    return places.map(p => ({
      placeId: p.id,
      name: p.nameCN,
      nameEN: p.nameEN || undefined,
      lat: p.lat,
      lng: p.lng,
      confidence: (p.metadata?.trailheadConfidence || 'low') as 'high' | 'medium' | 'low',
      parkingPlaceId: p.metadata?.associatedParking
        ? parseInt(p.metadata.associatedParking)
        : undefined,
      distanceToParking: p.metadata?.distanceToParking
        ? parseFloat(p.metadata.distanceToParking)
        : undefined,
      tags: p.metadata?.rawTags || {},
    }));
  }

  /**
   * 获取安全保障点
   */
  private async getSafetyPoints(region: string): Promise<{
    hospital: number;
    clinic: number;
    pharmacy: number;
    police: number;
    fireStation: number;
    total: number;
  }> {
    const counts = await prisma.$queryRaw<Array<{
      canonicalType: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('HOSPITAL', 'CLINIC', 'PHARMACY', 'POLICE', 'FIRE_STATION')
      GROUP BY metadata->>'canonicalType'
    `;

    const result = {
      hospital: 0,
      clinic: 0,
      pharmacy: 0,
      police: 0,
      fireStation: 0,
      total: 0,
    };

    counts.forEach(c => {
      const count = Number(c.count);
      result.total += count;
      
      switch (c.canonicalType) {
        case 'HOSPITAL':
          result.hospital = count;
          break;
        case 'CLINIC':
          result.clinic = count;
          break;
        case 'PHARMACY':
          result.pharmacy = count;
          break;
        case 'POLICE':
          result.police = count;
          break;
        case 'FIRE_STATION':
          result.fireStation = count;
          break;
      }
    });

    return result;
  }

  /**
   * 获取补给点
   */
  private async getSupplyPoints(region: string): Promise<{
    fuel: number;
    supermarket: number;
    convenience: number;
    total: number;
  }> {
    const counts = await prisma.$queryRaw<Array<{
      canonicalType: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('FUEL_STATION', 'SUPERMARKET', 'CONVENIENCE_STORE')
      GROUP BY metadata->>'canonicalType'
    `;

    const result = {
      fuel: 0,
      supermarket: 0,
      convenience: 0,
      total: 0,
    };

    counts.forEach(c => {
      const count = Number(c.count);
      result.total += count;
      
      switch (c.canonicalType) {
        case 'FUEL_STATION':
          result.fuel = count;
          break;
        case 'SUPERMARKET':
          result.supermarket = count;
          break;
        case 'CONVENIENCE_STORE':
          result.convenience = count;
          break;
      }
    });

    return result;
  }

  /**
   * 获取交通节点
   */
  private async getTransportPoints(region: string): Promise<{
    airport: number;
    parking: number;
    total: number;
  }> {
    const counts = await prisma.$queryRaw<Array<{
      canonicalType: string;
      count: bigint;
    }>>`
      SELECT 
        metadata->>'canonicalType' as "canonicalType",
        COUNT(*) as count
      FROM "Place"
      WHERE metadata->>'region' = ${region}
        AND metadata->>'canonicalType' IN ('AIRPORT', 'PARKING')
      GROUP BY metadata->>'canonicalType'
    `;

    const result = {
      airport: 0,
      parking: 0,
      total: 0,
    };

    counts.forEach(c => {
      const count = Number(c.count);
      result.total += count;
      
      switch (c.canonicalType) {
        case 'AIRPORT':
          result.airport = count;
          break;
        case 'PARKING':
          result.parking = count;
          break;
      }
    });

    return result;
  }
}

