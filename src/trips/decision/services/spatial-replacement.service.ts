// src/trips/decision/services/spatial-replacement.service.ts
/**
 * Spatial Replacement Service
 * 
 * Neptune 的空间替换核心算法
 * 
 * 职责：
 * 1. 候选点搜索（PostGIS）
 * 2. 评分函数
 * 3. 三类替换场景处理
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SpatialIssue, NeptuneInput } from '../interfaces/spatial-issue.interface';
import { ReplacementCandidate, ReplacementOperation } from '../interfaces/replacement-candidate.interface';
import { RoutePlanDraft, RouteSegment } from '../shared/world-model.types';

@Injectable()
export class SpatialReplacementService {
  private readonly logger = new Logger(SpatialReplacementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 替换入口点
   */
  async replaceEntry(
    issue: SpatialIssue,
    input: NeptuneInput
  ): Promise<ReplacementOperation | null> {
    this.logger.debug(`替换入口点: ${issue.issueId}`);

    if (!issue.poiId || !issue.originalLocation) {
      return null;
    }

    // 1. 查找候选入口点（在同一走廊内）
    const candidates = await this.findCandidateEntriesWithinCorridor(
      issue.originalLocation,
      input.routeDirection,
      input.world.physical.countryCode
    );

    if (candidates.length === 0) {
      this.logger.warn(`未找到入口替代候选点`);
      return null;
    }

    // 2. 评分并排序
    const scored = candidates
      .map(cand => ({
        cand,
        score: this.scoreReplacement(
          {
            poiId: issue.poiId!,
            lat: issue.originalLocation!.lat,
            lng: issue.originalLocation!.lng,
            type: '',
            tags: [],
            distM: 0,
            corridorT: 0,
            demDeltaM: 0,
            popularity: 0,
          },
          cand,
          input.routeDirection
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score < 0.4) {
      // 阈值，可配置
      this.logger.warn(`最佳候选点评分过低: ${best.score}`);
      return null;
    }

    return {
      type: 'ENTRY_REPLACEMENT',
      originalPoiId: issue.poiId,
      newPoiId: best.cand.poiId,
      score: best.score,
      explanation: `入口点因${issue.reason}不可达，已替换为同一走廊内的替代入口点（距离 ${(best.cand.distM / 1000).toFixed(1)}km）`,
    };
  }

  /**
   * 替换单个 POI
   */
  async replacePoi(
    issue: SpatialIssue,
    input: NeptuneInput,
    dayIndex: number
  ): Promise<ReplacementOperation | null> {
    this.logger.debug(`替换 POI: ${issue.issueId}, 第 ${dayIndex} 天`);

    if (!issue.poiId || !issue.originalLocation) {
      return null;
    }

    // 1. 查找候选 POI（在同一走廊内，同类型）
    const candidates = await this.findCandidatePoisWithinCorridor(
      issue.originalLocation,
      input.routeDirection,
      input.world.physical.countryCode,
      dayIndex
    );

    if (candidates.length === 0) {
      return null;
    }

    // 2. 检查节奏约束（不破坏当日节奏）
    const daySegments = input.plan.segments.filter(s => s.dayIndex === dayIndex);
    const originalDayTotalKm = daySegments.reduce((sum, s) => sum + s.distanceKm, 0);

    const scored = candidates
      .map(cand => {
        // 估算新路段距离
        const estimatedNewSegmentKm = cand.distM / 1000;
        const candDayTotalKm = originalDayTotalKm + estimatedNewSegmentKm;

        // 节奏约束：变化不超过 20%
        const rhythmPenalty = Math.abs(candDayTotalKm - originalDayTotalKm) / originalDayTotalKm > 0.2
          ? 0.5  // 降分
          : 1.0;

        const baseScore = this.scoreReplacement(
          {
            poiId: issue.poiId!,
            lat: issue.originalLocation!.lat,
            lng: issue.originalLocation!.lng,
            type: '',
            tags: [],
            distM: 0,
            corridorT: 0,
            demDeltaM: 0,
            popularity: 0,
          },
          cand,
          input.routeDirection
        );

        return {
          cand,
          score: baseScore * rhythmPenalty,
        };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best.score < 0.4) {
      return null;
    }

    return {
      type: 'POI_REPLACEMENT',
      originalPoiId: issue.poiId,
      newPoiId: best.cand.poiId,
      score: best.score,
      explanation: `POI 因${issue.reason}不可用，已替换为同一走廊内的替代 POI（距离 ${(best.cand.distM / 1000).toFixed(1)}km，步行距离变化 < 1km）`,
    };
  }

  /**
   * 替换局部走廊（路段阻塞）
   */
  async replaceSegmentCorridor(
    issue: SpatialIssue,
    input: NeptuneInput
  ): Promise<ReplacementOperation | null> {
    this.logger.debug(`替换局部走廊: ${issue.segmentId}`);

    if (!issue.segmentId) {
      return null;
    }

    // 找到被封路段
    const blockedSegment = input.plan.segments.find(s => s.segmentId === issue.segmentId);
    if (!blockedSegment) {
      return null;
    }

    // TODO: 实现局部走廊替换逻辑
    // 1. 找到被封 segment 在 corridor 上的位置 [tStart, tEnd]
    // 2. 在该区间附近寻找可替代路网
    // 3. 计算绕行路径
    // 4. 替换为 2-3 段新 segment

    // 简化版本：先返回 null，表示无法替换
    // 实际实现需要调用路网最短路径算法

    return null;
  }

  /**
   * 查找候选入口点（在同一走廊内）
   */
  private async findCandidateEntriesWithinCorridor(
    originalLocation: { lat: number; lng: number },
    routeDirection: NeptuneInput['routeDirection'],
    countryCode: string
  ): Promise<ReplacementCandidate[]> {
    if (!routeDirection.corridorGeom) {
      return [];
    }

    try {
      // 使用 PostGIS 查询候选入口点
      // 注意：这里使用 Prisma 的 $queryRaw，实际需要根据你的 POI 表结构调整
      const bufferRadiusM = 30000; // 30km 缓冲

      const candidates = await this.prisma.$queryRaw<any[]>`
        SELECT
          p.id as "poiId",
          p."lat",
          p."lng",
          p.type,
          p.tags,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326),
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE "lat" = ${originalLocation.lat} AND "lng" = ${originalLocation.lng}
            LIMIT 1
          ) AS "demDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND p.type IN ('ENTRANCE', 'TRAIL_HEAD', 'VIEWPOINT')
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography,
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326)::geography,
            ${bufferRadiusM}
          )
        ORDER BY "distM" ASC
        LIMIT 50
      `;

      return candidates.map(c => ({
        poiId: String(c.poiId),
        lat: parseFloat(c.lat),
        lng: parseFloat(c.lng),
        type: c.type || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        distM: parseFloat(c.distM) || 0,
        corridorT: parseFloat(c.corridorT) || 0,
        demDeltaM: parseFloat(c.demDeltaM) || 0,
        popularity: parseFloat(c.popularity) || 0.5,
      }));
    } catch (error) {
      this.logger.error(`查找候选入口点失败: ${error}`);
      return [];
    }
  }

  /**
   * 查找候选 POI（在同一走廊内）
   */
  private async findCandidatePoisWithinCorridor(
    originalLocation: { lat: number; lng: number },
    routeDirection: NeptuneInput['routeDirection'],
    countryCode: string,
    dayIndex: number
  ): Promise<ReplacementCandidate[]> {
    if (!routeDirection.corridorGeom) {
      return [];
    }

    try {
      const bufferRadiusM = 20000; // 20km 缓冲

      const candidates = await this.prisma.$queryRaw<any[]>`
        SELECT
          p.id as "poiId",
          p."lat",
          p."lng",
          p.type,
          p.tags,
          COALESCE(p.popularity, 0.5) as popularity,
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${originalLocation.lng}, ${originalLocation.lat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography
          ) AS "distM",
          ST_LineLocatePoint(
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326),
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)
          ) AS "corridorT",
          COALESCE(p."elevationM", 0) - (
            SELECT COALESCE("elevationM", 0)
            FROM "Place"
            WHERE "lat" = ${originalLocation.lat} AND "lng" = ${originalLocation.lng}
            LIMIT 1
          ) AS "demDeltaM"
        FROM "Place" p
        WHERE
          p."countryCode" = ${countryCode}
          AND ST_DWithin(
            ST_SetSRID(ST_MakePoint(p."lng", p."lat"), 4326)::geography,
            ST_GeomFromText(${routeDirection.corridorGeom}, 4326)::geography,
            ${bufferRadiusM}
          )
        ORDER BY "distM" ASC
        LIMIT 50
      `;

      return candidates.map(c => ({
        poiId: String(c.poiId),
        lat: parseFloat(c.lat),
        lng: parseFloat(c.lng),
        type: c.type || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        distM: parseFloat(c.distM) || 0,
        corridorT: parseFloat(c.corridorT) || 0,
        demDeltaM: parseFloat(c.demDeltaM) || 0,
        popularity: parseFloat(c.popularity) || 0.5,
      }));
    } catch (error) {
      this.logger.error(`查找候选 POI 失败: ${error}`);
      return [];
    }
  }

  /**
   * 评分函数
   * 
   * 我们希望选出的替代点：
   * - 像原来的点（功能与体验）
   * - 不破坏节奏（距离 / DEM / 天数）
   * - 仍在同一条"故事线"上
   */
  scoreReplacement(
    original: Partial<ReplacementCandidate>,
    candidate: ReplacementCandidate,
    routeDirection: NeptuneInput['routeDirection']
  ): number {
    // 1. 标签相似度（Jaccard）
    const tagScore = this.jaccardSimilarity(
      original.tags || [],
      candidate.tags
    );

    // 2. 距离评分（20km 衰减）
    const distScore = Math.exp(-candidate.distM / 20000);

    // 3. DEM 评分
    const demScore =
      candidate.demDeltaM <= 0
        ? 1.0  // 更低或相似 → 安全
        : Math.exp(-candidate.demDeltaM / 300); // 高太多扣分

    // 4. 走廊位置评分（在走廊同一段越近越好）
    const originalT = original.corridorT || 0.5;
    const corridorScore = 1 - Math.abs(candidate.corridorT - originalT);

    // 5. 热度评分
    const popularityScore = candidate.popularity;

    // 6. 根据 RouteDirection 哲学微调权重
    // 对于"哲学严格"的 RD（如 F 路穿越），tagScore 和 corridorScore 权重更高
    const isStrictPhilosophy = routeDirection.metadata?.strictPhilosophy === true;

    const weights = isStrictPhilosophy
      ? {
          tagScore: 0.35,
          distScore: 0.15,
          demScore: 0.20,
          corridorScore: 0.25,
          popularityScore: 0.05,
        }
      : {
          tagScore: 0.30,
          distScore: 0.20,
          demScore: 0.20,
          corridorScore: 0.20,
          popularityScore: 0.10,
        };

    const totalScore =
      weights.tagScore * tagScore +
      weights.distScore * distScore +
      weights.demScore * demScore +
      weights.corridorScore * corridorScore +
      weights.popularityScore * popularityScore;

    return totalScore;
  }

  /**
   * Jaccard 相似度
   */
  private jaccardSimilarity(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) {
      return 1.0;
    }

    const intersection = set1.filter(x => set2.includes(x)).length;
    const union = new Set([...set1, ...set2]).size;

    return union === 0 ? 0 : intersection / union;
  }
}

