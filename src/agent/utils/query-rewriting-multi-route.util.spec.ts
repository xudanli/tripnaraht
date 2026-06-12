import {
  buildMultiRouteSearchQueries,
  expansionRoutesToVariants,
  mergeMultiRouteResults,
} from './query-rewriting-multi-route.util';
import type { QueryRewriteResult } from './query-rewriting.types';

const SAMPLE_REWRITE: QueryRewriteResult = {
  original_query: '三亚海景酒店',
  contextualized_query: '三亚 允许携带宠物 海景酒店',
  expansion_routes: {
    synonym: ['三亚 宾馆 海景', '三亚 住宿 海景'],
    hyponym: ['亚龙湾', '海棠湾'],
    scenario: ['允许携带宠物', '宠物友好'],
  },
  standardized_query: { destination: '三亚', category: '酒店' },
  confidence: 0.85,
};

describe('query-rewriting-multi-route.util', () => {
  it('buildMultiRouteSearchQueries 生成 primary + 三路拓展', () => {
    const routes = buildMultiRouteSearchQueries(SAMPLE_REWRITE, { maxPerRoute: 2 });
    expect(routes[0].route).toBe('primary');
    expect(routes[0].weight).toBe(1);
    expect(routes.some((r) => r.route === 'synonym')).toBe(true);
    expect(routes.some((r) => r.route === 'hyponym')).toBe(true);
    expect(routes.some((r) => r.route === 'scenario')).toBe(true);
    const queries = routes.map((r) => r.query);
    expect(new Set(queries).size).toBe(queries.length);
  });

  it('expansionRoutesToVariants 排除 primary', () => {
    const variants = expansionRoutesToVariants(SAMPLE_REWRITE, 3);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants).not.toContain(SAMPLE_REWRITE.contextualized_query);
  });

  it('mergeMultiRouteResults 按 route weight 合并', () => {
    const routes = buildMultiRouteSearchQueries(SAMPLE_REWRITE, { maxPerRoute: 1 });
    const map = new Map<string, Array<{ id: string; score: number }>>();
    map.set(routes[0].query, [{ id: 'a', score: 4.5 }]);
    const variant = routes.find((r) => r.route !== 'primary')!;
    map.set(variant.query, [{ id: 'a', score: 3.0 }, { id: 'b', score: 4.0 }]);

    const merged = mergeMultiRouteResults(map, routes, 5, {
      idFn: (x) => x.id,
      scoreFn: (x) => x.score,
    });
    expect(merged.map((m) => m.id)).toContain('a');
    expect(merged.map((m) => m.id)).toContain('b');
    expect(merged[0].id).toBe('a');
  });
});
