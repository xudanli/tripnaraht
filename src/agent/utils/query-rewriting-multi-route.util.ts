/**
 * expansion_routes 多路并行召回：构建检索 query 列表 + 加权合并。
 */

import type { QueryRewriteExpansionRoutes, QueryRewriteResult } from './query-rewriting.types';

export type ExpansionRouteKind = 'primary' | 'synonym' | 'hyponym' | 'scenario';

export interface MultiRouteSearchQuery {
  query: string;
  route: ExpansionRouteKind;
  weight: number;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildLaneQuery(primary: string, term: string, route: ExpansionRouteKind): string {
  const t = term.trim();
  if (!t) return primary;
  if (route === 'synonym' && (t.length >= primary.length * 0.55 || /\s/.test(t))) {
    return normalizeWhitespace(t);
  }
  if (primary.includes(t)) return primary;
  return normalizeWhitespace(`${primary} ${t}`);
}

/**
 * 从 QueryRewriteResult 构建多路并行检索 query（主 query + 三路拓展）。
 */
export function buildMultiRouteSearchQueries(
  rewrite: QueryRewriteResult,
  options?: { maxPerRoute?: number },
): MultiRouteSearchQuery[] {
  const maxPerRoute = options?.maxPerRoute ?? 2;
  const primary = normalizeWhitespace(rewrite.contextualized_query);
  const seen = new Set<string>();
  const out: MultiRouteSearchQuery[] = [];

  const push = (query: string, route: ExpansionRouteKind, weight: number) => {
    const q = normalizeWhitespace(query);
    if (!q || seen.has(q)) return;
    seen.add(q);
    out.push({ query: q, route, weight });
  };

  push(primary, 'primary', 1.0);

  const lanes: Array<{ terms: string[]; route: ExpansionRouteKind; baseWeight: number }> = [
    { terms: rewrite.expansion_routes.synonym, route: 'synonym', baseWeight: 0.75 },
    { terms: rewrite.expansion_routes.hyponym, route: 'hyponym', baseWeight: 0.65 },
    { terms: rewrite.expansion_routes.scenario, route: 'scenario', baseWeight: 0.55 },
  ];

  for (const lane of lanes) {
    lane.terms.slice(0, maxPerRoute).forEach((term, i) => {
      push(buildLaneQuery(primary, term, lane.route), lane.route, lane.baseWeight / (i + 1));
    });
  }

  return out;
}

/** 从 expansion_routes 扁平化变体（兼容旧 expandQuery 接口） */
export function expansionRoutesToVariants(
  rewrite: QueryRewriteResult,
  maxVariants = 3,
): string[] {
  return buildMultiRouteSearchQueries(rewrite, { maxPerRoute: maxVariants })
    .filter((r) => r.route !== 'primary')
    .map((r) => r.query)
    .slice(0, maxVariants);
}

/**
 * 多路召回加权合并（RAG chunk / 酒店 place 等通用）。
 */
export function mergeMultiRouteResults<T>(
  resultsMap: Map<string, T[]>,
  routes: MultiRouteSearchQuery[],
  limit: number,
  opts: {
    idFn: (item: T) => string;
    scoreFn: (item: T) => number;
    attachScore?: (item: T, score: number) => T;
  },
): T[] {
  const resultScores = new Map<string, { item: T; score: number }>();

  for (const route of routes) {
    const results = resultsMap.get(route.query) ?? [];
    for (const item of results) {
      const id = opts.idFn(item);
      const score = opts.scoreFn(item) * route.weight;
      const existing = resultScores.get(id);
      if (!existing || score > existing.score) {
        resultScores.set(id, { item, score });
      }
    }
  }

  return [...resultScores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, score }) => (opts.attachScore ? opts.attachScore(item, score) : item));
}

/** 从 expansion_routes 结构直接构建（无完整 rewrite 时的降级） */
export function buildMultiRouteFromExpansionRoutes(
  primary: string,
  routes: QueryRewriteExpansionRoutes,
  maxPerRoute = 2,
): MultiRouteSearchQuery[] {
  return buildMultiRouteSearchQueries(
    {
      original_query: primary,
      contextualized_query: primary,
      expansion_routes: routes,
      standardized_query: {},
      confidence: 0.5,
    },
    { maxPerRoute },
  );
}
