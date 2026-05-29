// src/skills/geo/geo-find-candidate-within-corridor.skill.ts
/**
 * tripnara.geo.findCandidateWithinCorridor
 * 
 * P1: 在走廊内查找候选点
 * 
 * 功能：Neptune 的空间候选召回工具化，在路线走廊内查找候选 POI/入口点
 * 包装 SpatialReplacementService.findCandidateEntriesWithinCorridor
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillOutput } from '../interfaces/skill.interface';
import { BaseSkillInput } from '../interfaces/base-skill-input.interface';
import { SpatialReplacementService } from '../../trips/decision/services/spatial-replacement.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface GeoFindCandidateWithinCorridorInput extends BaseSkillInput {
  /** 原始位置 */
  originalLocation: {
    lat: number;
    lng: number;
  };
  
  /** 路线走廊几何（WKT 格式或 PostGIS geometry） */
  corridorGeom: string | any;
  
  /** 国家代码 */
  countryCode: string;
  
  /** 缓冲半径（米，默认 20000m = 20km） */
  bufferRadius?: number;
  
  /** 候选类型 */
  candidateType?: 'POI' | 'ENTRY' | 'BOTH';
  
  /** POI 类别过滤（可选） */
  poiCategory?: string[];
  
  /** 返回数量限制（默认 50） */
  limit?: number;
}

export interface GeoFindCandidateWithinCorridorOutput extends SkillOutput {
  /** 候选点列表 */
  candidates: Array<{
    poiId?: string;
    entryId?: string;
    location: { lat: number; lng: number };
    distance: number; // 米（从原始位置）
    corridorPosition?: number; // 0-1，在走廊上的位置
    elevationDelta?: number; // 米（与原始位置的海拔差）
    category?: string;
    tags?: string[];
    popularity?: number;
    metadata?: Record<string, any>;
  }>;
  
  /** 查询摘要 */
  summary: {
    totalFound: number;
    bufferRadius: number;
    queryTime: number;
  };
}

@Injectable()
export class GeoFindCandidateWithinCorridorSkill
  implements Skill<GeoFindCandidateWithinCorridorInput, GeoFindCandidateWithinCorridorOutput>
{
  private readonly logger = new Logger(GeoFindCandidateWithinCorridorSkill.name);

  metadata = {
    name: 'geo.findCandidateWithinCorridor',
    description: 'geo.findCandidateWithinCorridor：在走廊内查找候选点：Neptune 的空间候选召回工具化，在路线走廊内查找候选 POI/入口点',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'DOMAIN' as const,
  };

  constructor(
    @Optional() private readonly spatialReplacement?: SpatialReplacementService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    if (!this.spatialReplacement) {
      this.logger.warn('SpatialReplacementService 未注入，geo.findCandidateWithinCorridor 功能将受限');
    }
    if (!this.prisma) {
      this.logger.warn('PrismaService 未注入，geo.findCandidateWithinCorridor 无法执行原始查询');
    }
  }

  async execute(
    input: GeoFindCandidateWithinCorridorInput,
  ): Promise<GeoFindCandidateWithinCorridorOutput> {
    const startTime = Date.now();
    this.logger.debug(
      `执行 geo.findCandidateWithinCorridor: countryCode=${input.countryCode}, bufferRadius=${input.bufferRadius}`,
    );

    try {
      // 1. 安全控制：限制最大 bufferRadius 和 limit
      const MAX_BUFFER_RADIUS = 50000; // 50km
      const MAX_LIMIT = 100;
      const validatedBufferRadius = Math.min(input.bufferRadius || 20000, MAX_BUFFER_RADIUS);
      const validatedLimit = Math.min(input.limit || 50, MAX_LIMIT);

      if (!this.prisma) {
        throw new Error('PrismaService 未注入，无法执行查询');
      }

      const candidates: GeoFindCandidateWithinCorridorOutput['candidates'] = [];

      // 2. 如果请求 POI 候选，查询 POI
      if (input.candidateType === 'POI' || input.candidateType === 'BOTH' || !input.candidateType) {
        const poiCandidates = await this.findPOIsWithinCorridor(
          input.originalLocation,
          input.corridorGeom,
          input.countryCode,
          validatedBufferRadius,
          input.poiCategory,
          validatedLimit,
        );
        candidates.push(...poiCandidates);
      }

      // 3. 如果请求 ENTRY 候选，查询入口点
      if (input.candidateType === 'ENTRY' || input.candidateType === 'BOTH') {
        // TODO: 如果有入口点表，可以在这里查询
        // 当前 SpatialReplacementService.findCandidateEntriesWithinCorridor 需要 routeDirection 对象
        // 这里简化处理，只返回 POI 候选
        this.logger.debug('ENTRY 候选查询待实现（需要 routeDirection 对象）');
      }

      // 4. 去重和排序（按距离）
      const uniqueCandidates = this.deduplicateCandidates(candidates);
      uniqueCandidates.sort((a, b) => a.distance - b.distance);
      const finalCandidates = uniqueCandidates.slice(0, validatedLimit);

      const queryTime = Date.now() - startTime;
      this.logger.debug(
        `geo.findCandidateWithinCorridor 查询完成: 找到 ${finalCandidates.length} 个候选，耗时 ${queryTime}ms`,
      );

      return {
        candidates: finalCandidates,
        summary: {
          totalFound: finalCandidates.length,
          bufferRadius: validatedBufferRadius,
          queryTime,
        },
      };
    } catch (error: any) {
      this.logger.error(`geo.findCandidateWithinCorridor 查询失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 在走廊内查找 POI
   */
  private async findPOIsWithinCorridor(
    originalLocation: { lat: number; lng: number },
    corridorGeom: string | any,
    countryCode: string,
    bufferRadius: number,
    poiCategory?: string[],
    limit: number = 50,
  ): Promise<GeoFindCandidateWithinCorridorOutput['candidates']> {
    if (!this.prisma) {
      return [];
    }

    try {
      // 构建 PostGIS 查询
      const isWktString = typeof corridorGeom === 'string' &&
        (corridorGeom.startsWith('LINESTRING') ||
         corridorGeom.startsWith('MULTILINESTRING') ||
         corridorGeom.startsWith('POLYGON'));

      const categoryFilter = poiCategory && poiCategory.length > 0
        ? Prisma.sql`AND category = ANY(ARRAY[${Prisma.raw(
            poiCategory.map((c) => `'${c}'`).join(', '),
          )}]::"PlaceCategory"[])`
        : Prisma.sql``;

      const candidates = await this.prisma.$queryRaw<any[]>`
        SELECT
          p.id as "poiId",
          p."nameCN",
          p."nameEN",
          p.category,
          p.tags,
          p.metadata,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          COALESCE(p."elevationM", 0) as "elevationM",
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            p.location::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ${isWktString ? Prisma.sql`ST_GeomFromText(${corridorGeom}, 4326)` : Prisma.sql`${corridorGeom}::geometry`},
            p.location::geometry
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE ST_Y(location::geometry) = ${originalLocation.lat} 
              AND ST_X(location::geometry) = ${originalLocation.lng}
            LIMIT 1
          ) AS "elevationDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          AND ST_DWithin(
            p.location::geography,
            ${isWktString ? Prisma.sql`ST_GeomFromText(${corridorGeom}, 4326)::geography` : Prisma.sql`${corridorGeom}::geography`},
            ${bufferRadius}
          )
          ${categoryFilter}
        ORDER BY "distM" ASC
        LIMIT ${limit};
      `;

      return candidates.map((c) => ({
        poiId: String(c.poiId),
        location: { lat: c.lat, lng: c.lng },
        distance: Math.round(c.distM),
        corridorPosition: c.corridorT !== null ? Number(c.corridorT) : undefined,
        elevationDelta: c.elevationDeltaM !== null ? Number(c.elevationDeltaM) : undefined,
        category: c.category,
        tags: Array.isArray(c.tags) ? c.tags : [],
        popularity: Number(c.popularity),
        metadata: c.metadata as Record<string, any>,
      }));
    } catch (error: any) {
      this.logger.error(`查找 POI 候选失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 去重候选点（基于位置）
   */
  private deduplicateCandidates(
    candidates: GeoFindCandidateWithinCorridorOutput['candidates'],
  ): GeoFindCandidateWithinCorridorOutput['candidates'] {
    const seen = new Set<string>();
    const unique: GeoFindCandidateWithinCorridorOutput['candidates'] = [];

    for (const candidate of candidates) {
      const key = `${candidate.location.lat.toFixed(6)}_${candidate.location.lng.toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      }
    }

    return unique;
  }
}
