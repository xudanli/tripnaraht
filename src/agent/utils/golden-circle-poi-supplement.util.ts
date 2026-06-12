/**
 * Golden Circle 补检：将锚点 / Geysir-Gullfoss 专补接入 POI 多路召回管道。
 */

import {
  GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
  GOLDEN_CIRCLE_RETRIEVAL_PROFILE,
} from '../../planning-policy/regions/golden-circle-anchor-retrieval-profile';
import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import { buildMultiRouteSearchQueries } from './query-rewriting-multi-route.util';
import {
  buildPoiSearchPlanFromContext,
  type PoiSearchPlan,
} from './query-rewriting-poi-context.util';
import type { QueryRewriteResult } from './query-rewriting.types';

export interface GoldenCircleSupplementInput {
  poiSearchCtx: PoiSearchContext;
  boostedTerms?: string[];
  gapSuffix?: string;
  maxRoutesPerLane?: number;
}

export interface GoldenCircleSupplementPlans {
  /** 全圈锚点补检（需 boostedTerms） */
  anchor?: PoiSearchPlan;
  /** Geysir / Gullfoss 专补 */
  pair: PoiSearchPlan;
}

function enrichRewriteWithGoldenCircleAnchors(rewrite: QueryRewriteResult): QueryRewriteResult {
  const anchorSlugs = GOLDEN_CIRCLE_RETRIEVAL_PROFILE.requiredAnchors.map((a) => a.aliases[0]);
  const anchorPatterns = GOLDEN_CIRCLE_RETRIEVAL_PROFILE.requiredAnchors.flatMap(
    (a) => (a.dbNamePatterns ?? []).slice(0, 2),
  );
  const prefix = rewrite.contextualized_query.split(/\s+/).slice(0, 4).join(' ');

  const hyponym = [
    ...new Set([
      ...rewrite.expansion_routes.hyponym,
      ...anchorSlugs,
      ...anchorPatterns,
    ]),
  ].slice(0, 8);

  const synonym = [
    ...new Set([
      ...rewrite.expansion_routes.synonym,
      ...anchorSlugs.map((alias) => `${prefix} ${alias}`.replace(/\s+/g, ' ').trim()),
    ]),
  ].slice(0, 6);

  return {
    ...rewrite,
    standardized_query: {
      ...rewrite.standardized_query,
      destination: rewrite.standardized_query.destination ?? 'Iceland',
      filters: {
        ...(rewrite.standardized_query.filters ?? {}),
        region_id: 'golden_circle',
      },
    },
    expansion_routes: {
      ...rewrite.expansion_routes,
      synonym,
      hyponym,
    },
  };
}

function finalizeGoldenCirclePlan(plan: PoiSearchPlan, maxRoutesPerLane: number): PoiSearchPlan {
  const rewrite = enrichRewriteWithGoldenCircleAnchors(plan.rewrite);
  const routes = buildMultiRouteSearchQueries(rewrite, { maxPerRoute: maxRoutesPerLane });
  return {
    contextualizedQuery: rewrite.contextualized_query,
    rewrite,
    routes,
  };
}

/**
 * 构建 Golden Circle 补检计划（含 expansion_routes 多路 query）。
 */
export function buildGoldenCircleSupplementPlans(
  input: GoldenCircleSupplementInput,
): GoldenCircleSupplementPlans {
  const maxRoutesPerLane = input.maxRoutesPerLane ?? 2;

  const pair = finalizeGoldenCirclePlan(
    buildPoiSearchPlanFromContext({
      baseQuery: GOLDEN_CIRCLE_GEYSIR_GULLFOSS_RECALL_QUERY,
      poiSearchCtx: input.poiSearchCtx,
      gapSuffix: input.gapSuffix,
      variant: 'scenic',
      maxRoutesPerLane,
    }),
    maxRoutesPerLane,
  );

  const plans: GoldenCircleSupplementPlans = { pair };

  if (input.boostedTerms?.length) {
    plans.anchor = finalizeGoldenCirclePlan(
      buildPoiSearchPlanFromContext({
        baseQuery: 'Iceland Golden Circle',
        poiSearchCtx: input.poiSearchCtx,
        gapSuffix: input.gapSuffix,
        boostTerms: input.boostedTerms.slice(0, 10),
        variant: 'scenic',
        maxRoutesPerLane,
      }),
      maxRoutesPerLane,
    );
  }

  return plans;
}
