/**
 * Query Rewriting v1.1 集成测试：规则管道 → 多路召回 → 加权合并（Mock 下游）。
 */

import { Test } from '@nestjs/testing';
import { QueryRewritingService } from './query-rewriting.service';
import { QueryRewritingDictionaryService } from './query-rewriting-dictionary.service';
import { QueryRewriteMetricsService } from './query-rewrite-metrics.service';
import { RedisEntityResolutionProvider } from '../providers/redis-entity-resolution.provider';
import { VectorEntityResolutionProvider } from '../providers/vector-entity-resolution.provider';
import {
  buildMultiRouteSearchQueries,
  mergeMultiRouteResults,
} from '../utils/query-rewriting-multi-route.util';
import { rewritePoiSearchQuerySync } from '../utils/query-rewriting-poi-context.util';

describe('QueryRewriting integration (v1.1)', () => {
  let rewritingService: QueryRewritingService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        VectorEntityResolutionProvider,
        RedisEntityResolutionProvider,
        {
          provide: QueryRewritingDictionaryService,
          useFactory: (redisEr: RedisEntityResolutionProvider) =>
            new QueryRewritingDictionaryService(redisEr),
          inject: [RedisEntityResolutionProvider],
        },
        QueryRewriteMetricsService,
        QueryRewritingService,
      ],
    }).compile();

    await module.get(RedisEntityResolutionProvider).seedFromStaticGraph();

    rewritingService = module.get(QueryRewritingService);
  });

  it('Redis 精确别名命中跳过 Stage 1 LLM', async () => {
    const rewrite = await rewritingService.rewrite({
      query: '大苹果 海景酒店',
      scene: 'hotel',
      profile: 'user_facing',
    });
    expect(rewrite.pipeline?.entity_resolution_source).toBe('redis_exact');
    expect(rewrite.standardized_query.destination).toBe('纽约');
    expect(rewrite.contextualized_query).toMatch(/纽约/);
  });

  it('规则降级改写 → 多路 query → Mock 酒店召回加权合并', async () => {
    const rewrite = await rewritingService.rewrite({
      query: '过几天想去上海迪士尼住一晚稍微好点的酒店',
      scene: 'hotel',
      profile: 'agent_internal',
      session: { selectedDestination: '上海' },
    });

    expect(rewrite.pipeline?.trace_id).toBeDefined();
    expect(rewrite.contextualized_query).toMatch(/上海|迪士尼/i);

    const routes = buildMultiRouteSearchQueries(rewrite, { maxPerRoute: 2 });
    expect(routes.length).toBeGreaterThan(1);

    const mockHotels = (q: string) => {
      if (q.includes('迪士尼')) {
        return [{ placeId: 'h1', name: '迪士尼酒店', rating: 4.5 }];
      }
      if (q.includes('宾馆') || q.includes('住宿')) {
        return [{ placeId: 'h2', name: '附近宾馆', rating: 4.0 }];
      }
      return [];
    };

    const resultsMap = new Map<string, Array<{ placeId: string; name: string; rating: number }>>();
    for (const route of routes) {
      resultsMap.set(route.query, mockHotels(route.query));
    }

    const merged = mergeMultiRouteResults(resultsMap, routes, 5, {
      idFn: (h) => h.placeId,
      scoreFn: (h) => h.rating,
    });

    expect(merged.length).toBeGreaterThan(0);
    expect(merged[0].placeId).toBe('h1');
  });

  it('POI agent_internal 同步改写 + 多路（0 Token）', () => {
    const rewrite = rewritePoiSearchQuerySync({
      query: 'Iceland Golden Circle attractions',
      scene: 'poi',
      profile: 'agent_internal',
      poiContext: { destination: 'Iceland', pacing: 'relaxed', noveltyBias: 0.6 },
    });
    const routes = buildMultiRouteSearchQueries(rewrite);
    expect(routes[0].route).toBe('primary');
    expect(routes.length).toBeGreaterThan(1);
    expect(rewrite.pipeline?.stage2_generative ?? false).toBe(false);
  });
});
