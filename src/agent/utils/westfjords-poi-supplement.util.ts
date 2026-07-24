/**
 * Westfjords 西峡湾补检：稀疏 POI 区域多路裂变（Route 61 / 渡轮 / 观鸟 / 补给）。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import { buildMultiRouteSearchQueries } from './query-rewriting-multi-route.util';
import {
  buildPoiSearchPlanFromContext,
  type PoiSearchPlan,
} from './query-rewriting-poi-context.util';
import type { QueryRewriteResult } from './query-rewriting.types';

export const WESTFJORDS_ROUTE61_RECALL_QUERY =
  'Iceland Westfjords Route 61 supply station gas fuel Ísafjörður Patreksfjörður emergency shelter';

export const WESTFJORDS_FERRY_FROAD_RECALL_QUERY =
  'Iceland Westfjords F-road fjord ferry Baldur Brjánslækur Stykkishólmur Dynjandi waterfall';

export const WESTFJORDS_BIRDWATCH_RECALL_QUERY =
  'Iceland Westfjords Látrabjarg bird cliffs puffin Hornstrandir viewpoint scenic';

export interface WestfjordsSupplementInput {
  poiSearchCtx: PoiSearchContext;
  boostedTerms?: string[];
  gapSuffix?: string;
  maxRoutesPerLane?: number;
}

export interface WestfjordsSupplementLane {
  key: string;
  plan: PoiSearchPlan;
}

function enrichRewriteWithWestfjordsAnchors(rewrite: QueryRewriteResult): QueryRewriteResult {
  const scenario = [
    ...new Set([
      ...rewrite.expansion_routes.scenario,
      'Route 61 supply',
      'fjord ferry',
      'Dynjandi waterfall',
      'Látrabjarg bird cliffs',
      'emergency shelter',
    ]),
  ].slice(0, 8);

  const hyponym = [
    ...new Set([
      ...rewrite.expansion_routes.hyponym,
      'Ísafjörður',
      'Dynjandi',
      'Látrabjarg',
      'Hornstrandir',
    ]),
  ].slice(0, 6);

  return {
    ...rewrite,
    standardized_query: {
      ...rewrite.standardized_query,
      destination: rewrite.standardized_query.destination ?? 'Iceland',
      filters: {
        ...(rewrite.standardized_query.filters ?? {}),
        region_id: 'westfjords',
      },
    },
    expansion_routes: {
      ...rewrite.expansion_routes,
      scenario,
      hyponym,
    },
  };
}

function finalizeWestfjordsPlan(plan: PoiSearchPlan, maxRoutesPerLane: number): PoiSearchPlan {
  const rewrite = enrichRewriteWithWestfjordsAnchors(plan.rewrite);
  const routes = buildMultiRouteSearchQueries(rewrite, { maxPerRoute: maxRoutesPerLane });
  return { contextualizedQuery: rewrite.contextualized_query, rewrite, routes };
}

function buildLane(
  key: string,
  baseQuery: string,
  input: WestfjordsSupplementInput,
): WestfjordsSupplementLane {
  const max = input.maxRoutesPerLane ?? 2;
  const plan = finalizeWestfjordsPlan(
    buildPoiSearchPlanFromContext({
      baseQuery,
      poiSearchCtx: input.poiSearchCtx,
      gapSuffix: input.gapSuffix,
      boostTerms: input.boostedTerms?.slice(0, 8),
      variant: 'scenic',
      maxRoutesPerLane: max,
    }),
    max,
  );
  return { key, plan };
}

/** 构建西峡湾多路补检计划 */
export function buildWestfjordsSupplementLanes(
  input: WestfjordsSupplementInput,
): WestfjordsSupplementLane[] {
  const scenicBase =
    input.boostedTerms?.length
      ? `Iceland Westfjords scenic viewpoints ${input.boostedTerms.slice(0, 10).join(' ')}`
      : 'Iceland Westfjords scenic viewpoints Dynjandi Látrabjarg';

  return [
    buildLane('westfjords_scenic', scenicBase, input),
    buildLane('westfjords_route61', WESTFJORDS_ROUTE61_RECALL_QUERY, input),
    buildLane('westfjords_ferry_froad', WESTFJORDS_FERRY_FROAD_RECALL_QUERY, input),
    buildLane('westfjords_birdwatch', WESTFJORDS_BIRDWATCH_RECALL_QUERY, input),
  ];
}
