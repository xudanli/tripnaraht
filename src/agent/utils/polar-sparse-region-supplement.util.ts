/**
 * 格陵兰 / 斯瓦尔巴 — 稀疏极地 POI 补检车道 + 默认 Open-World Stub。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import { buildMultiRouteSearchQueries } from './query-rewriting-multi-route.util';
import {
  buildPoiSearchPlanFromContext,
  type PoiSearchPlan,
} from './query-rewriting-poi-context.util';

export const GREENLAND_NUUK_RECALL_QUERY =
  'Greenland Nuuk capital museum settlement Arctic expedition kayak';

export const GREENLAND_DISKO_RECALL_QUERY =
  'Greenland Disko Bay Ilulissat iceberg kayak boat tour Arctic';

export const SVALBARD_LONGYEARBYEN_RECALL_QUERY =
  'Svalbard Longyearbyen Arctic museum polar bear safety guide';

export const SVALBARD_EXPEDITION_RECALL_QUERY =
  'Svalbard snowmobile expedition aurora weather window Arctic';

export interface PolarSparseSupplementInput {
  poiSearchCtx: PoiSearchContext;
  boostedTerms?: string[];
  gapSuffix?: string;
  maxRoutesPerLane?: number;
}

export interface PolarSparseSupplementLane {
  key: string;
  plan: PoiSearchPlan;
  limit: number;
}

function finalizePolarPlan(plan: PoiSearchPlan, maxRoutesPerLane: number): PoiSearchPlan {
  const routes = buildMultiRouteSearchQueries(plan.rewrite, { maxPerRoute: maxRoutesPerLane });
  return { contextualizedQuery: plan.rewrite.contextualized_query, rewrite: plan.rewrite, routes };
}

function buildPolarLane(
  input: PolarSparseSupplementInput,
  key: string,
  baseQuery: string,
): PolarSparseSupplementLane {
  const maxRoutes = input.maxRoutesPerLane ?? 3;
  const plan = finalizePolarPlan(
    buildPoiSearchPlanFromContext({
      baseQuery,
      poiSearchCtx: input.poiSearchCtx,
      gapSuffix: input.gapSuffix,
      boostTerms: input.boostedTerms?.slice(0, 8),
      variant: 'scenic',
      maxRoutesPerLane: maxRoutes,
    }),
    maxRoutes,
  );
  return { key, plan, limit: 10 };
}

export function buildGreenlandSupplementLanes(input: PolarSparseSupplementInput): PolarSparseSupplementLane[] {
  return [
    buildPolarLane(input, 'greenland_nuuk', GREENLAND_NUUK_RECALL_QUERY),
    buildPolarLane(input, 'greenland_disco', GREENLAND_DISKO_RECALL_QUERY),
  ];
}

export function buildSvalbardSupplementLanes(input: PolarSparseSupplementInput): PolarSparseSupplementLane[] {
  return [
    buildPolarLane(input, 'svalbard_base', SVALBARD_LONGYEARBYEN_RECALL_QUERY),
    buildPolarLane(input, 'svalbard_expedition', SVALBARD_EXPEDITION_RECALL_QUERY),
  ];
}

export { buildDefaultPolarRegionStubs } from '../../planning-policy/open-world/polar-region-stubs.util';
