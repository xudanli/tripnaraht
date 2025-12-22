// src/trips/readiness/services/poi-pickup-scorer.service.ts

/**
 * POI 集合点评分器
 * 
 * 从 OSM POI 中推断"出海集合点/码头优先级"
 * 适用于斯瓦尔巴等需要出海活动的场景
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClient } from '@prisma/client';

export interface PickupPoint {
  poiId: string;
  name: string;
  lat: number;
  lng: number;
  score: number;
  reasons: string[];
  category: string;
  distanceToCoastlineM: number | null;
  hasContactInfo: boolean;
  tags: Record<string, any>;
}

@Injectable()
export class POIPickupScorerService {
  private readonly logger = new Logger(POIPickupScorerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查找并评分出海集合点候选
   * 
   * @param lat 中心点纬度
   * @param lng 中心点经度
   * @param radiusKm 搜索半径（公里），默认 25km
   * @param limit 返回数量，默认 5
   */
  async findTopPickupPoints(
    lat: number,
    lng: number,
    radiusKm: number = 25,
    limit: number = 5
  ): Promise<PickupPoint[]> {
    try {
      const radiusM = radiusKm * 1000;
      
      // 1. 召回候选点（满足任一条件）
      const candidates = await this.recallCandidates(lat, lng, radiusM);
      
      // 2. 计算到海岸线的距离
      const candidatesWithCoastline = await Promise.all(
        candidates.map(async (candidate) => {
          const distance = await this.getDistanceToCoastline(candidate.lat, candidate.lng);
          return { ...candidate, distanceToCoastlineM: distance };
        })
      );
      
      // 3. 评分
      const scored = candidatesWithCoastline.map(candidate => this.scoreCandidate(candidate));
      
      // 4. 排序并返回 Top N
      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      this.logger.error(`查找集合点失败 (${lat}, ${lng}):`, error);
      return [];
    }
  }

  /**
   * 召回候选集合点
   */
  private async recallCandidates(
    lat: number,
    lng: number,
    radiusM: number
  ): Promise<Array<{
    poiId: string;
    name: string;
    lat: number;
    lng: number;
    category: string;
    tags: Record<string, any>;
    hasContactInfo: boolean;
  }>> {
    const result = await (this.prisma as any).$queryRawUnsafe(`
      SELECT 
        poi_id,
        name_default,
        lat,
        lng,
        category,
        tags_slim,
        opening_hours,
        phone,
        website
      FROM poi_canonical
      WHERE geom IS NOT NULL
        AND (
          category IN ('PORT', 'HARBOUR')
          OR tags_slim->>'amenity' = 'ferry_terminal'
          OR tags_slim->>'man_made' = 'pier'
          OR tags_slim->>'leisure' = 'marina'
          OR tags_slim->>'landuse' = 'harbour'
          OR tags_slim->>'water' = 'harbour'
          OR tags_slim->>'harbour' IS NOT NULL
          OR tags_slim->>'office' = 'tourism'
          OR tags_slim->>'tourism' = 'agency'
          OR tags_slim->>'amenity' = 'boat_rental'
        )
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusM}
        )
      ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography;
    `);

    return result.map((row: any) => ({
      poiId: row.poi_id,
      name: row.name_default || '未命名',
      lat: row.lat,
      lng: row.lng,
      category: row.category,
      tags: row.tags_slim || {},
      hasContactInfo: !!(row.opening_hours || row.phone || row.website),
    }));
  }

  /**
   * 获取到海岸线的距离
   */
  private async getDistanceToCoastline(lat: number, lng: number): Promise<number | null> {
    try {
      const result = await (this.prisma as any).$queryRawUnsafe(`
        SELECT 
          ST_Distance(
            geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_m
        FROM geo_coastlines
        WHERE geom IS NOT NULL
        ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        LIMIT 1;
      `) as Array<{ distance_m: number }>;

      if (result && result.length > 0) {
        return Math.round(result[0].distance_m);
      }
      return null;
    } catch (error) {
      this.logger.warn(`查询海岸线距离失败:`, error);
      return null;
    }
  }

  /**
   * 评分候选点
   */
  private scoreCandidate(candidate: {
    poiId: string;
    name: string;
    lat: number;
    lng: number;
    category: string;
    tags: Record<string, any>;
    hasContactInfo: boolean;
    distanceToCoastlineM: number | null;
  }): PickupPoint {
    let score = 0;
    const reasons: string[] = [];

    // 强信号
    if (candidate.tags['amenity'] === 'ferry_terminal') {
      score += 100;
      reasons.push('渡轮码头（强信号）');
    }

    // 中强信号
    if (candidate.tags['man_made'] === 'pier') {
      score += 60;
      reasons.push('栈桥/码头结构');
    }

    // 港区语义
    if (candidate.category === 'HARBOUR' || 
        candidate.tags['leisure'] === 'marina' ||
        candidate.tags['landuse'] === 'harbour' ||
        candidate.tags['water'] === 'harbour' ||
        candidate.tags['harbour']) {
      score += 40;
      reasons.push('港区/游艇码头');
    }

    // 游客中心/信息点（集合说明更清晰）
    if (candidate.tags['tourism'] === 'information') {
      score += 30;
      reasons.push('游客中心/信息点');
    }

    // 可联系/可核验
    if (candidate.hasContactInfo) {
      score += 20;
      reasons.push('有联系方式/营业时间');
    }

    // 距离海岸线近（< 300m）
    if (candidate.distanceToCoastlineM !== null && candidate.distanceToCoastlineM < 300) {
      score += 15;
      reasons.push(`距离海岸线 ${candidate.distanceToCoastlineM}m`);
    } else if (candidate.distanceToCoastlineM !== null && candidate.distanceToCoastlineM < 1000) {
      score += 5;
      reasons.push(`距离海岸线 ${candidate.distanceToCoastlineM}m`);
    }

    // 旅行社/运营商入口
    if (candidate.tags['office'] === 'tourism' ||
        candidate.tags['tourism'] === 'agency' ||
        candidate.tags['amenity'] === 'boat_rental') {
      score += 10;
      reasons.push('旅行社/运营商入口');
    }

    // 负分：货运港区
    if (candidate.tags['cargo'] === 'yes' ||
        candidate.tags['industrial'] === 'yes' ||
        candidate.tags['landuse'] === 'industrial') {
      score -= 30;
      reasons.push('可能是货运/工业港区');
    }

    return {
      poiId: candidate.poiId,
      name: candidate.name,
      lat: candidate.lat,
      lng: candidate.lng,
      score,
      reasons,
      category: candidate.category,
      distanceToCoastlineM: candidate.distanceToCoastlineM,
      hasContactInfo: candidate.hasContactInfo,
      tags: candidate.tags,
    };
  }
}

