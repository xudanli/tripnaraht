/**
 * POI 检索上下文规则后缀 — 迁入 Query Rewriting 管道 Stage 2a（确定性扩展）。
 * 替代 planning-policy 内散落的字符串拼接。
 */

import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';
import type { QueryRewriteInput, QueryRewriteResult } from './query-rewriting.types';
import { buildMultiRouteSearchQueries, type MultiRouteSearchQuery } from './query-rewriting-multi-route.util';
import {
  assembleQueryRewriteResult,
  rewriteQueryWithRules,
} from './query-rewriting.util';

const MAX_POI_CONTEXT_TERMS = 14;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 从 PoiSearchContext 提取拓展检索词（原 buildContextualPoiSearchQuerySuffix 核心逻辑）。
 */
export function buildPoiContextExpansionTerms(ctx: PoiSearchContext): string[] {
  const terms: string[] = [];

  if (ctx.tripStyle?.length) {
    terms.push(...ctx.tripStyle.slice(0, 4));
  }

  if (ctx.pacing === 'intensive') {
    terms.push('iconic', 'landmarks', 'efficient', 'route');
  } else if (ctx.pacing === 'relaxed') {
    terms.push('slow', 'travel', 'neighborhood', 'cafe', 'walk');
  }

  if (typeof ctx.fatigueScore === 'number' && ctx.fatigueScore >= 0.45) {
    terms.push('easy', 'walk', 'light', 'activity', 'rest', 'friendly');
  }

  if (typeof ctx.noveltyBias === 'number' && ctx.noveltyBias >= 0.45) {
    terms.push('hidden', 'gems', 'local', 'favorites', 'less', 'crowded');
  }

  if (ctx.preferOffbeatAttractions) {
    terms.push('hidden', 'gems', 'local', 'secret', 'off', 'beaten', 'path', '小众', '秘境');
  }

  const cond = ctx.weather?.condition?.toLowerCase() ?? '';
  if (cond.includes('elevated_precip') || cond.includes('windy')) {
    terms.push('weather', 'flexible', 'indoor', 'options', 'scenic', 'drive');
  }

  if (ctx.selectedPoiIds?.length) {
    terms.push('variety', 'alternatives', 'beyond', 'classics');
  }

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    uniq.push(t.trim());
    if (uniq.length >= MAX_POI_CONTEXT_TERMS) break;
  }
  return uniq;
}

/**
 * 仅提取 POI 上下文拓展词后缀（不带 baseQuery）。
 * 完整检索请使用 `buildPoiSearchQueryFromContext`（scene: 'poi' 管道）。
 */
export function buildPoiContextSuffixString(ctx: PoiSearchContext): string {
  const terms = buildPoiContextExpansionTerms(ctx);
  return terms.length ? ` ${terms.join(' ')}` : '';
}

/**
 * @deprecated 使用 `buildPoiSearchQueryFromContext`；此别名保留兼容旧 import 路径。
 */
export function buildContextualPoiSearchQuerySuffix(ctx: PoiSearchContext): string {
  return buildPoiContextSuffixString(ctx);
}

/** Stage 2a：将 POI 上下文词注入 contextualized_query 与 expansion_routes.scenario */
export function applyPoiContextEnrichment(
  result: QueryRewriteResult,
  ctx: PoiSearchContext,
): QueryRewriteResult {
  const terms = buildPoiContextExpansionTerms(ctx);
  if (!terms.length) return result;

  let contextualized = result.contextualized_query;
  for (const term of terms) {
    if (!contextualized.toLowerCase().includes(term.toLowerCase())) {
      contextualized = normalizeWhitespace(`${contextualized} ${term}`);
    }
  }

  const scenario = [...new Set([...result.expansion_routes.scenario, ...terms])].slice(0, 10);

  return {
    ...result,
    contextualized_query: contextualized,
    standardized_query: {
      ...result.standardized_query,
      destination: result.standardized_query.destination ?? ctx.destination,
      category: result.standardized_query.category ?? 'attraction',
      filters: {
        ...(result.standardized_query.filters ?? {}),
        ...(ctx.pacing ? { pacing: ctx.pacing } : {}),
        ...(typeof ctx.fatigueScore === 'number' ? { fatigue_score: ctx.fatigueScore } : {}),
        ...(typeof ctx.noveltyBias === 'number' ? { novelty_bias: ctx.noveltyBias } : {}),
        ...(ctx.preferOffbeatAttractions ? { prefer_offbeat: true } : {}),
        ...(ctx.dayIndex !== undefined ? { day_index: ctx.dayIndex } : {}),
      },
    },
    expansion_routes: {
      ...result.expansion_routes,
      scenario,
    },
  };
}

/** Agent 内部 POI 检索：规则管道同步改写（无 LLM） */
export function rewritePoiSearchQuerySync(input: QueryRewriteInput): QueryRewriteResult {
  const poiInput: QueryRewriteInput = {
    ...input,
    scene: 'poi',
    profile: input.profile ?? 'agent_internal',
  };
  const stage1 = rewriteQueryWithRules(poiInput);
  let result = assembleQueryRewriteResult(stage1, poiInput, {
    stage1_source: 'rules',
    stage2_deterministic: true,
    stage2_generative: false,
  });
  if (poiInput.poiContext) {
    result = applyPoiContextEnrichment(result, poiInput.poiContext);
  }
  return result;
}

export interface PoiSearchQueryBuildInput {
  baseQuery: string;
  poiSearchCtx: PoiSearchContext;
  gapSuffix?: string;
  boostTerms?: string[];
  variant?: 'scenic' | 'general' | 'offbeat';
}

export interface PoiSearchPlan {
  contextualizedQuery: string;
  rewrite: QueryRewriteResult;
  routes: MultiRouteSearchQuery[];
}

function buildRawPoiQueryFromInput(input: PoiSearchQueryBuildInput): string {
  const scenicPart =
    input.variant === 'scenic'
      ? ' attractions landmark museum sightseeing'
      : input.variant === 'offbeat'
        ? ' hidden gems local secret off beaten path 小众 秘境 less crowded'
        : '';
  const boost =
    input.boostTerms?.length
      ? ` ${input.boostTerms.slice(0, input.variant === 'scenic' ? 12 : 8).join(' ')}`
      : '';
  return `${input.baseQuery}${scenicPart}${boost}${input.gapSuffix ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * POI 检索计划：含改写结果与 expansion_routes 多路 query（供 poi.search 并行召回）。
 */
export function buildPoiSearchPlanFromContext(
  input: PoiSearchQueryBuildInput & { maxRoutesPerLane?: number },
): PoiSearchPlan {
  const rewrite = rewritePoiSearchQuerySync({
    query: buildRawPoiQueryFromInput(input),
    scene: 'poi',
    profile: 'agent_internal',
    poiContext: input.poiSearchCtx,
  });
  const routes = buildMultiRouteSearchQueries(rewrite, {
    maxPerRoute: input.maxRoutesPerLane ?? 2,
  });
  return {
    contextualizedQuery: rewrite.contextualized_query,
    rewrite,
    routes,
  };
}

/**
 * 统一 POI 检索 query 构建（替代 baseQuery + ctxSuffix + gapSuffix 手工拼接）。
 */
export function buildPoiSearchQueryFromContext(input: PoiSearchQueryBuildInput): string {
  return buildPoiSearchPlanFromContext(input).contextualizedQuery;
}
