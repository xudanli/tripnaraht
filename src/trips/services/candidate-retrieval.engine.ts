/**
 * TripNara 候选检索引擎
 *
 * 多阶段检索，避免单一 SQL 导致的类别偏差：
 * Step1 地理过滤（可选）
 * Step2 类别分桶（attraction/restaurant/shopping 分别采样）
 * Step3 综合评分排序
 * Step4 多样性采样（Top 40% + Popular 30% + Hidden gems 20% + Random 10%）
 *
 * @see docs/Decision_OS_实施例_旅行规划.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PlaceMetadata } from '../../places/interfaces/place-metadata.interface';
import type { ExperienceVector } from '../../places/interfaces/experience-vector.interface';
import { CreateTripDraftDto } from '../dto/trip-draft.dto';
import { TravelStyle } from '../dto/trip-draft.dto';
import { SpatialClusteringEngine } from './spatial-clustering.engine';
import { ExperienceVectorService } from '../../places/services/experience-vector.service';
import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';
import { ICELAND_POI_SLUG_KEYWORDS } from '../../planning-policy/regions/iceland-poi-slugs';
import { getAnchorRetrievalProfile } from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import { POI_PLANNING_SCORE_REASON } from '../../planning-policy/constants/poi-planning-score-reasons';

/** 候选地点（与 TripDraftService 兼容） */
export interface CandidatePlace {
  id: number;
  nameCN: string;
  nameEN?: string | null;
  type: string;
  category: string;
  lat: number;
  lng: number;
  openingHours?: any;
  avgVisitDuration?: number;
  tags?: string[];
  popularity?: number;
  rating?: number;
  /** TripNara Phase2: 空间聚类 ID，用于约束「同一天 cluster 不超过 2 个」 */
  clusterId?: number;
  /** TripNara PhaseA: 用于节奏控制（连续 museum ≤ 1） */
  canonicalType?: string;
  /** TripNara PhaseA: 用于疲劳计算，1.0=标准 */
  intensityFactor?: number;
  /** Travel World Model: 体验向量，用于多样性采样 */
  experienceVector?: ExperienceVector;
  /** Travel World Model: 最佳访问时段，用于路径优化 */
  bestVisitTime?: 'morning' | 'afternoon' | 'evening' | 'any';
  /** Travel World Model Phase 3: 区域 ID，用于同天 District 数量约束 */
  districtId?: number | null;
  /** 城市 ID（用于 dayAllocation 按天过滤） */
  cityId?: number | null;
  /** 城市名称（用于 dayAllocation 按天过滤） */
  cityName?: string | null;
  /** Phase 1.5：打分来源标签（可观测） */
  poiPlanningScoreReasons?: string[];
  /** Phase 2.5：必选锚点 — diversity 采样不得丢弃 */
  poiPlanningAdmissionProtected?: boolean;
}

/** 类别分桶配置（TripNara 规范） */
const CATEGORY_BUCKET_LIMITS: Record<string, number> = {
  ATTRACTION: 150,
  RESTAURANT: 200,
  SHOPPING: 50,
};

/** 多样性采样比例 */
const DIVERSITY_RATIOS = {
  topRated: 0.4,
  popular: 0.3,
  hiddenGems: 0.2,
  random: 0.1,
};

const ACTIVITY_PREFERENCE_SCORE_REASON = 'activity_preference_boost';

type ActivityPreferenceRetrievalProfile = {
  keywords: string[];
  canonicalTypes: string[];
  tags: string[];
};

const ACTIVITY_PREFERENCE_PROFILES: Record<string, ActivityPreferenceRetrievalProfile> = {
  glacier_hiking: {
    keywords: ['冰川', '冰洞', 'glacier', 'ice cave', 'glacier walk'],
    canonicalTypes: [
      'GLACIER_WALK',
      'ICE_CAVE',
      'ATTRACTION_NATURE_GLACIER',
      'ATTRACTION_NATURE_GLACIER_LAGOON',
    ],
    tags: ['冰川', '冰洞', 'glacier', 'ice_cave', 'glacier_walk', 'adventure'],
  },
  adventure_activities: {
    keywords: ['火山', '峡谷', '漂流', 'volcano', 'canyon', 'rafting'],
    canonicalTypes: [
      'ATTRACTION_NATURE_VOLCANO',
      'ATTRACTION_NATURE_CANYON',
    ],
    tags: ['火山', '峡谷', '漂流', 'volcano', 'canyon', 'rafting', 'adventure'],
  },
};

@Injectable()
export class CandidateRetrievalEngine {
  private readonly logger = new Logger(CandidateRetrievalEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly spatialClustering: SpatialClusteringEngine,
    @Optional() private readonly experienceVectorService?: ExperienceVectorService,
  ) {}

  /**
   * 多阶段候选检索
   * @param options.routeDirectionId 路线方向 ID（uuid 或数字），提供时优先检索 signaturePois / RouteTemplate 中的 Place
   */
  async retrieve(
    dto: CreateTripDraftDto,
    options?: {
      centerLat?: number;
      centerLng?: number;
      radiusKm?: number;
      routeDirectionId?: string | number;
      /** DSO poiPlanning：锚点注入、排除、optional 加权 */
      poiPlanning?: PoiPlanningDecisionSlice;
    },
  ): Promise<CandidatePlace[]> {
    const countryCode = dto.destination.toUpperCase().trim();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error(`无效的国家代码: ${dto.destination}`);
    }

    const routeDirectionId = dto.routeDirectionId ?? options?.routeDirectionId;

    // Step 1: 地理过滤（可选）
    const geoFilter = await this.buildGeoFilter(countryCode, options);

    // Step 2: 类别分桶（午餐/晚餐需 RESTAURANT，故始终包含）
    let categoryFilter = dto.style ? this.getCategoryFilterByStyle(dto.style) : ['ATTRACTION', 'RESTAURANT'];
    if (!categoryFilter.includes('RESTAURANT')) {
      categoryFilter = [...categoryFilter, 'RESTAURANT'];
    }
    let bucketed = await this.retrieveByCategoryBuckets(
      countryCode,
      categoryFilter,
      geoFilter,
      dto.cities,
    );

    // Step 2a: mustHavePois 优先检索 - 用户指定的必含景点，合并并提升 compositeScore
    if (dto.mustHavePois && dto.mustHavePois.length > 0) {
      const mustHavePlaces = await this.fetchMustHavePois(countryCode, dto.mustHavePois);
      if (mustHavePlaces.length > 0) {
        bucketed = this.mergeSignaturePlaces(bucketed, mustHavePlaces);
        this.logger.log(`mustHavePois: 合并 ${mustHavePlaces.length} 个必含景点`);
      }
    }

    // Step 2a.5: 活动偏好召回/加权 - 用户表达兴趣时倾向纳入相关 POI，但不作为硬性必去
    const activityProfile = this.buildActivityPreferenceProfile(dto.activityPreferences);
    if (activityProfile) {
      const activityPlaces = await this.fetchMustHavePois(countryCode, activityProfile.keywords);
      if (activityPlaces.length > 0) {
        bucketed = this.mergeSignaturePlaces(
          bucketed,
          activityPlaces.map((place) => ({
            ...place,
            compositeScore: 8.5,
            poiPlanningScoreReasons: [
              ...(place.poiPlanningScoreReasons ?? []),
              ACTIVITY_PREFERENCE_SCORE_REASON,
            ],
          })),
        );
      }
      bucketed = this.applyActivityPreferenceBoost(bucketed, activityProfile);
      this.logger.log(
        `activityPreferences: 偏好=${dto.activityPreferences?.join(',') ?? ''}, 召回=${activityPlaces.length}`,
      );
    }

    // Step 2b: RouteDirection 偏好检索（Phase 4）- 合并 signature/RouteTemplate Place，提升 compositeScore
    if (routeDirectionId) {
      const signaturePlaces = await this.fetchSignaturePlaces(routeDirectionId, countryCode);
      if (signaturePlaces.length > 0) {
        bucketed = this.mergeSignaturePlaces(bucketed, signaturePlaces);
        this.logger.log(`RouteDirection 偏好: 合并 ${signaturePlaces.length} 个 signature Place`);
      }
    }

    // Step 2c: 区域意图 POI 规划（Phase 1）— 锚点必入池、排除、optional 加权
    if (options?.poiPlanning?.poiPlan && countryCode === 'IS') {
      bucketed = await this.applyPoiPlanningToBucket(countryCode, bucketed, options.poiPlanning);
      this.logger.log(
        `[POI Planning] region=${options.poiPlanning.routeIntent?.regionId ?? 'n/a'} anchors=${options.poiPlanning.poiPlan.requiredAnchorPoiIds?.length ?? 0}`,
      );
    }

    // Step 3 & 4: 评分 + 多样性采样
    const sampled = this.diversitySample(bucketed);

    // Step 5: 空间聚类（TripNara Phase 2，供约束引擎使用）
    const withClusters = this.spatialClustering.attachClusterIds(sampled);

    this.logger.log(
      `候选检索完成: 国家=${countryCode}, 分桶后=${bucketed.length}, 采样后=${sampled.length}, 聚类后=${withClusters.length}`,
    );

    return withClusters;
  }

  /**
   * 构建地理过滤条件（可选）
   * 当提供 centerLat/centerLng/radiusKm 时使用 ST_DWithin
   */
  private async buildGeoFilter(
    countryCode: string,
    options?: { centerLat?: number; centerLng?: number; radiusKm?: number },
  ): Promise<{ sql: Prisma.Sql; params?: { centerLat: number; centerLng: number; radiusM: number } } | null> {
    if (!options?.centerLat || !options?.centerLng || !options?.radiusKm || options.radiusKm <= 0) {
      return null;
    }

    const radiusM = options.radiusKm * 1000;
    return {
      sql: Prisma.sql`AND ST_DWithin(
        p.location::geography,
        ST_SetSRID(ST_MakePoint(${options.centerLng}, ${options.centerLat}), 4326)::geography,
        ${radiusM}
      )`,
      params: { centerLat: options.centerLat, centerLng: options.centerLng, radiusM },
    };
  }

  /**
   * 获取 RouteDirection 的 signature Place（signaturePois.examples + RouteTemplate dayPlans pois）
   * 降级：无数据或查询失败时返回空数组
   */
  private async fetchSignaturePlaces(
    routeDirectionId: string | number,
    countryCode: string,
  ): Promise<Array<CandidatePlace & { compositeScore: number }>> {
    try {
      const rd = await this.prisma.routeDirection.findFirst({
        where:
          typeof routeDirectionId === 'string' && /^\d+$/.test(routeDirectionId)
            ? { id: parseInt(routeDirectionId, 10), countryCode, isActive: true }
            : { uuid: String(routeDirectionId), countryCode, isActive: true },
        select: { id: true, signaturePois: true, RouteTemplate: { select: { dayPlans: true } } },
      });
      if (!rd) return [];

      const uuids = new Set<string>();
      const sig = rd.signaturePois as { examples?: string[] } | null;
      if (sig?.examples?.length) {
        sig.examples.forEach((u) => uuids.add(String(u)));
      }
      for (const t of rd.RouteTemplate || []) {
        const plans = (t.dayPlans as { pois?: { uuid?: string }[] }[]) || [];
        for (const plan of plans) {
          for (const poi of plan.pois || []) {
            if (poi?.uuid) uuids.add(String(poi.uuid));
          }
        }
      }
      if (uuids.size === 0) return [];

      const uuidList = [...uuids];
      const places = await this.prisma.$queryRaw<
        Array<{
          id: number;
          nameCN: string;
          nameEN: string | null;
          category: string;
          metadata: unknown;
          physicalMetadata: unknown;
          rating: number | null;
          lat: number;
          lng: number;
          districtId: number | null;
        }>
      >(Prisma.sql`
        SELECT p.id, p."nameCN", p."nameEN", p.category, p.metadata, p."physicalMetadata", p.rating,
          ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng, p."districtId"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE p.uuid = ANY(${uuidList}::text[])
          AND c."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
      `);

      const result: Array<CandidatePlace & { compositeScore: number }> = [];
      for (const p of places) {
        const metadata = (p.metadata as PlaceMetadata | null) ?? {};
        const pm = (p.physicalMetadata as Record<string, unknown> | null) ?? {};
        const ev = this.experienceVectorService?.getOrCompute({
          category: p.category,
          metadata: {
            experienceVector: metadata.experienceVector,
            canonicalType: metadata.canonicalType,
            rawTags: metadata.rawTags,
          },
        });
        const lat = p.lat;
        const lng = p.lng;
        result.push({
          id: p.id,
          nameCN: p.nameCN,
          nameEN: p.nameEN,
          type: p.category,
          category: p.category,
          lat,
          lng,
          openingHours: metadata.openingHours,
          avgVisitDuration: (pm.estimated_duration_min as number) || 60,
          tags: metadata.rawTags || [],
          popularity: (p.rating ?? 0) * 2,
          rating: p.rating ?? undefined,
          canonicalType: metadata.canonicalType,
          intensityFactor: (pm.intensity_factor as number) ?? 1.0,
          experienceVector: ev,
          bestVisitTime: pm.bestVisitTime as 'morning' | 'afternoon' | 'evening' | 'any' | undefined,
          districtId: p.districtId ?? undefined,
          compositeScore: 10, // 高分数确保进入 diversity 采样
        });
      }
      return result;
    } catch (e) {
      this.logger.warn(`fetchSignaturePlaces 失败: ${(e as Error)?.message}`);
      return [];
    }
  }

  /**
   * 合并 signature places 到 bucketed，已存在的提升 compositeScore，不存在的追加
   */
  private mergeSignaturePlaces(
    bucketed: Array<CandidatePlace & { compositeScore: number }>,
    signature: Array<CandidatePlace & { compositeScore: number }>,
  ): Array<CandidatePlace & { compositeScore: number }> {
    const byId = new Map(bucketed.map((p) => [p.id, p]));
    for (const s of signature) {
      const existing = byId.get(s.id);
      if (existing) {
        existing.compositeScore = Math.max(existing.compositeScore, s.compositeScore);
        if (s.poiPlanningAdmissionProtected) {
          existing.poiPlanningAdmissionProtected = true;
        }
        const merged = [
          ...(existing.poiPlanningScoreReasons ?? []),
          ...(s.poiPlanningScoreReasons ?? []),
        ];
        if (merged.length) {
          existing.poiPlanningScoreReasons = [...new Set(merged)];
        }
      } else {
        byId.set(s.id, { ...s });
      }
    }
    return [...byId.values()];
  }

  private buildActivityPreferenceProfile(
    activityPreferences?: string[],
  ): ActivityPreferenceRetrievalProfile | null {
    if (!activityPreferences?.length) return null;
    const merged: ActivityPreferenceRetrievalProfile = {
      keywords: [],
      canonicalTypes: [],
      tags: [],
    };
    for (const pref of activityPreferences) {
      const profile = ACTIVITY_PREFERENCE_PROFILES[pref];
      if (!profile) continue;
      merged.keywords.push(...profile.keywords);
      merged.canonicalTypes.push(...profile.canonicalTypes);
      merged.tags.push(...profile.tags);
    }
    merged.keywords = [...new Set(merged.keywords)];
    merged.canonicalTypes = [...new Set(merged.canonicalTypes)];
    merged.tags = [...new Set(merged.tags.map((tag) => tag.toLowerCase()))];
    return merged.keywords.length || merged.canonicalTypes.length || merged.tags.length ? merged : null;
  }

  private applyActivityPreferenceBoost(
    bucketed: Array<CandidatePlace & { compositeScore: number }>,
    profile: ActivityPreferenceRetrievalProfile,
  ): Array<CandidatePlace & { compositeScore: number }> {
    const canonicalTypes = new Set(profile.canonicalTypes.map((type) => type.toLowerCase()));
    const tags = new Set(profile.tags.map((tag) => tag.toLowerCase()));
    const keywords = profile.keywords.map((keyword) => keyword.toLowerCase());

    for (const place of bucketed) {
      const canonicalType = place.canonicalType?.toLowerCase();
      const placeTags = (place.tags ?? []).map((tag) => String(tag).toLowerCase());
      const haystack = [
        place.nameCN,
        place.nameEN,
        place.category,
        place.canonicalType,
        ...placeTags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matched =
        (canonicalType ? canonicalTypes.has(canonicalType) : false) ||
        placeTags.some((tag) => tags.has(tag)) ||
        keywords.some((keyword) => haystack.includes(keyword));

      if (!matched) continue;
      place.compositeScore = Math.max(place.compositeScore + 2.5, 8.5);
      place.poiPlanningScoreReasons = [
        ...new Set([
          ...(place.poiPlanningScoreReasons ?? []),
          ACTIVITY_PREFERENCE_SCORE_REASON,
        ]),
      ];
    }

    return bucketed;
  }

  /**
   * Phase 1：按 DSO poiPlanning 注入锚点、过滤排除、提升 optional 召回优先级（冰岛数据）
   */
  private async applyPoiPlanningToBucket(
    countryCode: string,
    bucketed: Array<CandidatePlace & { compositeScore: number }>,
    slice: PoiPlanningDecisionSlice,
  ): Promise<Array<CandidatePlace & { compositeScore: number }>> {
    const plan = slice.poiPlan;
    if (!plan) return bucketed;

    const slugMap = ICELAND_POI_SLUG_KEYWORDS;
    const anchorKeywords = new Set<string>();
    for (const slug of plan.requiredAnchorPoiIds ?? []) {
      for (const k of slugMap[slug] ?? []) {
        anchorKeywords.add(k);
      }
    }
    const prof = getAnchorRetrievalProfile(slice.routeIntent?.regionId);
    if (prof) {
      for (const a of prof.requiredAnchors) {
        for (const al of a.aliases) {
          anchorKeywords.add(al);
        }
      }
    }
    if (anchorKeywords.size > 0) {
      const anchorPlaces = await this.fetchMustHavePois(countryCode, [...anchorKeywords]);
      if (anchorPlaces.length > 0) {
        for (const ap of anchorPlaces) {
          ap.poiPlanningAdmissionProtected = true;
          ap.poiPlanningScoreReasons = [
            ...(ap.poiPlanningScoreReasons ?? []),
            POI_PLANNING_SCORE_REASON.REQUIRED_ANCHOR,
          ];
        }
        bucketed = this.mergeSignaturePlaces(bucketed, anchorPlaces);
      }
    }

    for (const slug of plan.excludedPoiIds ?? []) {
      const kws = slugMap[slug];
      if (!kws?.length) continue;
      const bad = await this.fetchMustHavePois(countryCode, kws);
      const badIds = new Set(bad.map((p) => p.id));
      if (badIds.size > 0) {
        bucketed = bucketed.filter((p) => {
          if (badIds.has(p.id)) {
            return false;
          }
          return true;
        });
      }
    }

    const optional = plan.optionalCandidatePoiIds ?? [];
    if (optional.length === 0) {
      return bucketed;
    }
    const boost = 2.5;
    for (const p of bucketed) {
      const hay = `${p.nameCN} ${p.nameEN ?? ''}`;
      for (const slug of optional) {
        const kws = slugMap[slug];
        if (!kws?.length) continue;
        if (
          kws.some(
            (k) =>
              hay.includes(k) ||
              hay.toLowerCase().includes(k.toLowerCase()),
          )
        ) {
          p.compositeScore += boost;
          p.poiPlanningScoreReasons = [
            ...(p.poiPlanningScoreReasons ?? []),
            POI_PLANNING_SCORE_REASON.OPTIONAL_BOOST,
          ];
          break;
        }
      }
    }
    return bucketed;
  }

  /**
   * 检索用户指定的必含 POI（按名称模糊匹配）
   */
  private async fetchMustHavePois(
    countryCode: string,
    keywords: string[],
  ): Promise<Array<CandidatePlace & { compositeScore: number }>> {
    if (keywords.length === 0) return [];
    const seen = new Set<number>();
    const result: Array<CandidatePlace & { compositeScore: number }> = [];
    for (const kw of keywords) {
      const pattern = `%${kw}%`;
      const raw = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        category: string;
        metadata: any;
        physicalMetadata: any;
        rating: number | null;
        lat: number;
        lng: number;
        districtId: number | null;
        cityId: number;
        cityName: string;
      }>>`
        SELECT p.id, p."nameCN", p."nameEN", p.category, p.metadata, p."physicalMetadata", p.rating,
          ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng, p."districtId",
          c.id as "cityId", c."nameCN" as "cityName"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          AND (p."nameCN" ILIKE ${pattern} OR p."nameEN" ILIKE ${pattern})
        ORDER BY p.rating DESC NULLS LAST
        LIMIT 5
      `;
      for (const p of raw) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        const metadata = (p.metadata as PlaceMetadata | null) ?? {};
        const pm = (p.physicalMetadata as Record<string, unknown> | null) ?? {};
        const ev = this.experienceVectorService?.getOrCompute({
          category: p.category,
          metadata: { experienceVector: metadata.experienceVector, canonicalType: metadata.canonicalType, rawTags: metadata.rawTags },
        });
        result.push({
          id: p.id,
          nameCN: p.nameCN,
          nameEN: p.nameEN,
          type: p.category,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          openingHours: metadata.openingHours,
          avgVisitDuration: (pm.estimated_duration_min as number) || 60,
          tags: metadata.rawTags || [],
          popularity: (p.rating ?? 0) * 2,
          rating: p.rating ?? undefined,
          canonicalType: metadata.canonicalType,
          intensityFactor: (pm.intensity_factor as number) ?? 1.0,
          experienceVector: ev,
          bestVisitTime: pm.bestVisitTime as 'morning' | 'afternoon' | 'evening' | 'any' | undefined,
          districtId: p.districtId ?? undefined,
          cityId: p.cityId,
          cityName: p.cityName,
          compositeScore: 10,
        });
      }
    }
    return result;
  }

  /**
   * Step 2: 按类别分桶检索，避免单一类别占满
   * @param cityNames 可选，按城市过滤（如 ["杭州", "千岛湖"]）
   */
  private async retrieveByCategoryBuckets(
    countryCode: string,
    allowedCategories: string[],
    geoFilter: { sql: Prisma.Sql } | null,
    cityNames?: string[],
  ): Promise<Array<CandidatePlace & { compositeScore: number }>> {
    const allPlaces: Array<CandidatePlace & { compositeScore: number }> = [];
    const geoSql = geoFilter?.sql ?? Prisma.empty;
    const citySql =
      cityNames && cityNames.length > 0
        ? Prisma.sql`AND (c."nameCN" IN (${Prisma.join(cityNames.map((c) => Prisma.sql`${c}`), ', ')}) OR c.name IN (${Prisma.join(cityNames.map((c) => Prisma.sql`${c}`), ', ')}))`
        : Prisma.empty;

    for (const category of allowedCategories) {
      const limit = CATEGORY_BUCKET_LIMITS[category] ?? 100;
      const rawPlaces = await this.prisma.$queryRaw<Array<{
        id: number;
        nameCN: string;
        nameEN: string | null;
        category: string;
        metadata: any;
        physicalMetadata: any;
        rating: number | null;
        lat: number;
        lng: number;
        districtId: number | null;
        cityId: number;
        cityName: string;
      }>>`
        SELECT 
          p.id,
          p."nameCN",
          p."nameEN",
          p.category,
          p.metadata,
          p."physicalMetadata",
          p.rating,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng,
          p."districtId",
          c.id as "cityId",
          c."nameCN" as "cityName"
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          AND p.category = ${category}::"PlaceCategory"
          ${geoSql}
          ${citySql}
        ORDER BY 
          (COALESCE(p.rating, 0) * 0.5 + COALESCE(p.rating, 0) * 2 * 0.3 + COALESCE(p.rating, 0) * 0.2) DESC,
          p."nameCN" ASC
        LIMIT ${limit}
      `;

      for (const place of rawPlaces) {
        const metadata = place.metadata as PlaceMetadata | null;
        const physicalMetadata = place.physicalMetadata as Record<string, unknown> | null;
        const rating = place.rating ?? 0;
        const popularity = rating * 2;
        const editorialScore = rating; // 无独立 editorialScore 时用 rating 近似

        // 🆕 增强评分：加入特色维度
        const rarityScore = this.computeRarityScore(place.category, countryCode);
        const culturalScore = this.computeCulturalScore(metadata);
        const uniquenessScore = this.computeUniquenessScore(metadata?.experienceVector);

        // 🆕 调整权重：特色维度占 40%
        const compositeScore =
          0.3 * rating +           // 降低纯评分权重（从0.5）
          0.2 * popularity +        // 降低热度权重（从0.3）
          0.2 * rarityScore +      // 新增：稀缺性
          0.15 * culturalScore +   // 新增：文化特色
          0.15 * uniquenessScore;  // 新增：独特性

        const ev = this.experienceVectorService?.getOrCompute({
          category: place.category,
          metadata: {
            experienceVector: metadata?.experienceVector,
            canonicalType: metadata?.canonicalType,
            rawTags: metadata?.rawTags,
          },
        });
        const bestVisitTime = (physicalMetadata?.bestVisitTime as 'morning' | 'afternoon' | 'evening' | 'any') ?? undefined;

        allPlaces.push({
          id: place.id,
          nameCN: place.nameCN,
          nameEN: place.nameEN,
          type: place.category,
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          openingHours: metadata?.openingHours,
          avgVisitDuration: (physicalMetadata?.estimated_duration_min as number) || 60,
          tags: metadata?.rawTags || [],
          popularity: popularity,
          rating: place.rating ?? undefined,
          canonicalType: metadata?.canonicalType || undefined,
          intensityFactor: (physicalMetadata?.intensity_factor as number) ?? 1.0,
          experienceVector: ev,
          bestVisitTime,
          districtId: place.districtId ?? undefined,
          cityId: place.cityId,
          cityName: place.cityName,
          compositeScore,
        });
      }
    }

    return allPlaces;
  }

  /**
   * Step 3 & 4: 综合评分 + 多样性采样
   * 🆕 改进 hidden gems 识别：不只是取中间段，而是识别真正的小众但高质量景点
   * Top rated 40% + Popular 30% + Hidden gems 20% + Random 10%
   */
  private diversitySample(places: Array<CandidatePlace & { compositeScore: number }>): CandidatePlace[] {
    if (places.length <= 50) {
      return places.map(({ compositeScore: _compositeScore, ...rest }) => rest);
    }

    // 按 compositeScore 降序
    const sorted = [...places].sort((a, b) => b.compositeScore - a.compositeScore);
    const n = sorted.length;

    const selectedIds = new Set<number>();

    // 🆕 首先保护必选锚点
    for (const p of sorted) {
      if (p.poiPlanningAdmissionProtected) {
        selectedIds.add(p.id);
      }
    }

    // 🆕 改进 hidden gems 识别：评分不错（4.0+）但热度不高（<6）的景点
    const hiddenGems = sorted.filter(p => {
      const rating = p.rating ?? 0;
      const popularity = p.popularity ?? 0;
      return rating >= 4.0 && popularity < 6 && !selectedIds.has(p.id);
    });

    const topRatedCount = Math.ceil(n * DIVERSITY_RATIOS.topRated);
    const popularCount = Math.ceil(n * DIVERSITY_RATIOS.popular);
    const hiddenGemsCount = Math.ceil(n * DIVERSITY_RATIOS.hiddenGems);
    const randomCount = Math.ceil(n * DIVERSITY_RATIOS.random);

    // Top 40%: 最高分
    for (let i = 0; i < Math.min(topRatedCount, sorted.length); i++) {
      selectedIds.add(sorted[i].id);
    }

    // Popular 30%: 中间段（避免与 top 完全重叠）
    const popularStart = Math.floor(n * 0.2);
    for (let i = 0; i < popularCount && popularStart + i < n; i++) {
      selectedIds.add(sorted[popularStart + i].id);
    }

    // 🆕 Hidden gems 20%: 优先选择真正的小众高质量景点
    const hiddenGemsSelected = Math.min(hiddenGemsCount, hiddenGems.length);
    for (let i = 0; i < hiddenGemsSelected; i++) {
      selectedIds.add(hiddenGems[i].id);
    }

    // 如果 hidden gems 不够，从中后段补充
    if (hiddenGemsSelected < hiddenGemsCount) {
      const hiddenStart = Math.floor(n * 0.5);
      for (let i = 0; i < (hiddenGemsCount - hiddenGemsSelected) && hiddenStart + i < n; i++) {
        selectedIds.add(sorted[hiddenStart + i].id);
      }
    }

    // Random 10%: 随机探索
    const remaining = sorted.filter((p) => !selectedIds.has(p.id));
    const randomPick = Math.min(randomCount, remaining.length);
    for (let i = 0; i < randomPick; i++) {
      const idx = Math.floor(Math.random() * remaining.length);
      selectedIds.add(remaining[idx].id);
      remaining.splice(idx, 1);
    }

    const result = sorted.filter((p) => selectedIds.has(p.id));
    return result.map(({ compositeScore: _compositeScore, ...rest }) => rest);
  }

  private getCategoryFilterByStyle(style: TravelStyle): string[] {
    const styleMap: Record<TravelStyle, string[]> = {
      [TravelStyle.NATURE]: ['ATTRACTION'],
      [TravelStyle.CULTURE]: ['ATTRACTION'],
      [TravelStyle.FOOD]: ['RESTAURANT'],
      [TravelStyle.CITYWALK]: ['ATTRACTION', 'SHOPPING'],
      [TravelStyle.PHOTOGRAPHY]: ['ATTRACTION'],
      [TravelStyle.ADVENTURE]: ['ATTRACTION'],
    };
    return styleMap[style] || ['ATTRACTION', 'RESTAURANT'];
  }

  /**
   * 🆕 计算稀缺性评分：基于类别在该国家的稀有程度
   * 稀有类别（如博物馆、历史遗迹）得分更高
   */
  private computeRarityScore(category: string, countryCode: string): number {
    // 定义各国家的稀有类别
    const rareCategoriesByCountry: Record<string, Set<string>> = {
      CN: new Set(['MUSEUM', 'HISTORICAL_SITE', 'TEMPLE', 'GARDEN']),
      JP: new Set(['MUSEUM', 'SHRINE', 'TEMPLE', 'ONSEN', 'CASTLE']),
      IS: new Set(['GLACIER', 'VOLCANO', 'GEYSER', 'WATERFALL', 'NATURE_RESERVE']),
      FR: new Set(['MUSEUM', 'MONUMENT', 'CHATEAU', 'CATHEDRAL']),
      IT: new Set(['MUSEUM', 'RUINS', 'CHURCH', 'VILLA']),
      GB: new Set(['CASTLE', 'PALACE', 'CATHEDRAL', 'GARDEN']),
    };

    const rareCategories = rareCategoriesByCountry[countryCode] || new Set(['MUSEUM', 'HISTORICAL_SITE', 'NATURE_RESERVE']);
    return rareCategories.has(category) ? 1.0 : 0.6;
  }

  /**
   * 🆕 计算文化特色评分：基于 tags 和 canonicalType
   * 具有地域文化特色的 POI 得分更高
   */
  private computeCulturalScore(metadata: PlaceMetadata | null): number {
    if (!metadata) return 0.5;

    const tags = metadata.rawTags || [];
    const canonicalType = metadata.canonicalType || '';
    const tagText = tags.join(' ').toLowerCase();
    const typeText = canonicalType.toLowerCase();

    // 文化特色关键词
    const culturalKeywords = [
      'heritage', 'historic', 'ancient', 'traditional', 'cultural',
      'temple', 'shrine', 'mosque', 'church', 'cathedral',
      'castle', 'palace', 'fortress', 'monument',
      '遗产', '古迹', '传统', '文化', '寺庙', '神社', '教堂', '城堡', '宫殿',
    ];

    const hasCulturalKeyword = culturalKeywords.some(kw =>
      tagText.includes(kw) || typeText.includes(kw)
    );

    return hasCulturalKeyword ? 1.0 : 0.5;
  }

  /**
   * 🆕 计算独特性评分：基于体验向量的多样性
   * 体验向量越独特（与主流差异越大），得分越高
   */
  private computeUniquenessScore(experienceVector?: ExperienceVector): number {
    if (!experienceVector) return 0.5;

    // 简化版：基于体验向量的熵或方差计算独特性
    // 这里使用一个简化的启发式方法
    const values = Object.values(experienceVector);
    if (values.length === 0) return 0.5;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    // 方差越大，说明体验向量越独特
    return Math.min(1.0, 0.5 + variance * 2);
  }
}
