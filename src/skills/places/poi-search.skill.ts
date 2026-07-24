// src/skills/places/poi-search.skill.ts
/**
 * poi.search Skill
 *
 * 搜索 POI（地点）；支持 expansion_routes 多路并行召回 + 加权合并。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { PlacesService } from '../../places/places.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';
import type { QueryRewriteResult } from '../../agent/utils/query-rewriting.types';
import {
  buildMultiRouteSearchQueries,
  mergeMultiRouteResults,
  type MultiRouteSearchQuery,
} from '../../agent/utils/query-rewriting-multi-route.util';
import { QueryRewriteMetricsService } from '../../agent/services/query-rewrite-metrics.service';
import { bindQueryRewriteDownstreamSafe } from '../../agent/utils/query-rewrite-metrics-bind.util';
import { inferEntityResolutionCountryCode } from '../../canonical-poi-resolution/adapters/cpre-entity-resolution.bridge';

export interface PoiSearchInput extends SkillInput {
  query: string;
  limit?: number;
  lat?: number;
  lng?: number;
  /** ISO 3166-1 alpha-2 — 冰岛 IS 时走 CPRE */
  countryCode?: string;
  category?: string;
  /**
   * 为 true 时仅关键词 SQL 召回，不生成 embedding / 不跑向量段。
   * 亦可设环境变量 `POI_SEARCH_KEYWORD_ONLY=1`（或 `true`）全局默认开启。
   */
  keyword_only?: boolean;
  /** Query Rewriting 完整结果；与 multiRouteSearch 配合启用多路并行召回 */
  queryRewriteResult?: QueryRewriteResult;
  /** 显式多路 query 计划（优先级高于 queryRewriteResult 内建 routes） */
  multiRouteQueries?: MultiRouteSearchQuery[];
  /** 是否基于 expansion_routes 并行多 query 召回（默认：有 rewrite 时为 true） */
  multiRouteSearch?: boolean;
  maxRoutesPerLane?: number;
}

export interface PoiSearchOutput extends SkillOutput {
  pois: Array<{
    poi_id: string;
    name: string;
    nameCN?: string;
    nameEN?: string;
    coordinates?: { lat: number; lng: number };
    category?: string;
    address?: string;
    evidence_id: string;
  }>;
}

type PoiRecord = PoiSearchOutput['pois'][number];

type ScoredPoi = PoiRecord & { _retrievalScore: number };

@SkillDecorator({
  name: 'poi.search',
  description: '搜索 poi 地点（类型、半径、关键词）。在 RESEARCH 阶段收集景点/餐厅/地标或 repair 需替换 POI 时调用。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class PoiSearchSkill implements Skill<PoiSearchInput, PoiSearchOutput> {
  private readonly logger = new Logger(PoiSearchSkill.name);

  metadata = {
    name: 'poi.search',
    description: '搜索 poi 地点（类型、半径、关键词）。在 RESEARCH 阶段收集景点/餐厅/地标或 repair 需替换 POI 时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['query'],
    },
  };

  constructor(
    @Optional() private readonly placesService?: PlacesService,
    @Optional() private readonly entityResolutionService?: EntityResolutionService,
    @Optional() private readonly queryRewriteMetrics?: QueryRewriteMetricsService,
  ) {
    this.logger.log(`[PoiSearchSkill] 已初始化`);
  }

  async execute(input: PoiSearchInput): Promise<PoiSearchOutput> {
    const keywordOnly =
      input.keyword_only === true ||
      /^(1|true|yes)$/i.test(String(process.env.POI_SEARCH_KEYWORD_ONLY ?? '').trim());
    const limit = input.limit || 10;

    const routes = this.resolveMultiRoutePlan(input);
    const useMultiRoute =
      input.multiRouteSearch !== false && routes.length > 1;

    this.logger.debug(
      `执行 poi.search: query=${input.query}, limit=${limit}, keyword_only=${keywordOnly}, multi_route=${useMultiRoute}, routes=${routes.length}`,
    );

    if (input.queryRewriteResult && this.queryRewriteMetrics) {
      this.queryRewriteMetrics.trackAgentInternalRewrite(
        input.queryRewriteResult,
        'poi',
        routes.length,
      );
    }

    try {
      let pois: PoiRecord[];
      if (useMultiRoute) {
        pois = await this.executeMultiRouteSearch(input, routes, limit, keywordOnly);
      } else {
        pois = await this.searchSingleQuery(input.query, input, limit, keywordOnly);
      }
      this.bindPoiDownstream(input, pois.length);
      return { pois };
    } catch (error: any) {
      this.bindPoiDownstream(input, 0);
      this.logger.error(`poi.search 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  private bindPoiDownstream(input: PoiSearchInput, totalResults: number): void {
    bindQueryRewriteDownstreamSafe(
      this.queryRewriteMetrics,
      {
        traceId: input.queryRewriteResult?.pipeline?.trace_id,
        totalResults,
        downstreamScene: 'poi',
      },
      this.logger,
    );
  }

  private resolveMultiRoutePlan(input: PoiSearchInput): MultiRouteSearchQuery[] {
    if (input.multiRouteQueries?.length) {
      return input.multiRouteQueries;
    }
    if (input.queryRewriteResult) {
      return buildMultiRouteSearchQueries(input.queryRewriteResult, {
        maxPerRoute: input.maxRoutesPerLane ?? 2,
      });
    }
    return [{ query: input.query, route: 'primary', weight: 1 }];
  }

  private async executeMultiRouteSearch(
    input: PoiSearchInput,
    routes: MultiRouteSearchQuery[],
    limit: number,
    keywordOnly: boolean,
  ): Promise<PoiRecord[]> {
    const perRouteLimit = Math.max(limit, Math.ceil(limit * 1.5));
    const resultsMap = new Map<string, ScoredPoi[]>();

    await Promise.all(
      routes.map(async (route) => {
        const pois = await this.searchSingleQuery(
          route.query,
          input,
          perRouteLimit,
          keywordOnly,
        );
        const scored: ScoredPoi[] = pois.map((p, idx) => ({
          ...p,
          _retrievalScore: ((perRouteLimit - idx) / perRouteLimit) * route.weight,
        }));
        resultsMap.set(route.query, scored);
      }),
    );

    const merged = mergeMultiRouteResults(resultsMap, routes, limit, {
      idFn: (p) => p.poi_id,
      scoreFn: (p) => p._retrievalScore,
    });

    this.logger.debug(
      `poi.search 多路合并: routes=${routes.length}, merged=${merged.length}`,
    );

    return merged.map(({ _retrievalScore: _s, ...poi }) => poi);
  }

  private async searchSingleQuery(
    query: string,
    input: PoiSearchInput,
    limit: number,
    keywordOnly: boolean,
  ): Promise<PoiRecord[]> {
    let pois: PoiRecord[] = [];

    if (this.entityResolutionService) {
      try {
        const countryCode = inferEntityResolutionCountryCode({
          countryCode: input.countryCode,
          query,
          lat: input.lat,
          lng: input.lng,
        });
        const resolutionResult = await this.entityResolutionService.resolveEntities(
          query,
          [],
          input.lat,
          input.lng,
          limit,
          {
            ...(keywordOnly ? { keywordOnly: true } : {}),
            ...(countryCode ? { countryCode } : {}),
          },
        );

        pois = resolutionResult.results
          .filter((r) => r.lat != null && r.lng != null && r.lat !== 0 && r.lng !== 0)
          .map((r) => {
            const canonicalPoiId =
              typeof r.metadata?.canonical_poi_id === 'string'
                ? r.metadata.canonical_poi_id
                : undefined;
            return {
              poi_id: canonicalPoiId ?? String(r.id),
              name: r.nameCN || r.nameEN || r.name,
              nameCN: r.nameCN ?? undefined,
              nameEN: r.nameEN ?? undefined,
              coordinates: { lat: r.lat!, lng: r.lng! },
              category: r.category ?? undefined,
              address: r.address ?? undefined,
              evidence_id:
                r.source === 'cpre' && canonicalPoiId
                  ? `cpre_${canonicalPoiId}_${Date.now()}`
                  : `poi_${r.id}_${Date.now()}`,
            };
          });
      } catch (error: any) {
        this.logger.warn(`EntityResolutionService 失败: ${error?.message}，尝试 PlacesService`);
      }
    }

    if (pois.length === 0 && this.placesService) {
      try {
        const searchResults = await this.placesService.search(
          query,
          input.lat,
          input.lng,
          undefined,
          undefined,
          limit,
        );

        pois = searchResults.map((place: any, index: number) => ({
          poi_id: String(place.id || place.place_id || `poi_${index}`),
          name: place.name || place.nameCN || place.nameEN || '未知地点',
          nameCN: place.nameCN ?? undefined,
          nameEN: place.nameEN ?? undefined,
          coordinates:
            place.geo || (place.lat && place.lng ? { lat: place.lat, lng: place.lng } : undefined),
          category: place.category ?? undefined,
          address: place.address ?? undefined,
          evidence_id: `poi_${place.id || place.place_id || index}_${Date.now()}`,
        }));
      } catch (error: any) {
        this.logger.error(`PlacesService 搜索失败: ${error?.message}`);
      }
    }

    return pois;
  }
}
