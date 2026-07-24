import {
  applyPoiContextEnrichment,
  buildContextualPoiSearchQuerySuffix,
  buildPoiContextExpansionTerms,
  buildPoiSearchPlanFromContext,
  buildPoiSearchQueryFromContext,
  rewritePoiSearchQuerySync,
} from './query-rewriting-poi-context.util';
import type { PoiSearchContext } from '../../planning-policy/types/poi-search-context.types';

const POI_CTX: PoiSearchContext = {
  destination: 'Iceland',
  noveltyBias: 0.6,
  fatigueScore: 0.5,
  pacing: 'relaxed',
};

describe('query-rewriting-poi-context.util', () => {
  it('buildContextualPoiSearchQuerySuffix 别名与管道拓展词一致', () => {
    const suffix = buildContextualPoiSearchQuerySuffix(POI_CTX);
    expect(suffix).toMatch(/hidden|slow|easy/i);
    expect(suffix.startsWith(' ')).toBe(true);
  });

  it('buildPoiContextExpansionTerms 迁移原后缀规则', () => {
    const terms = buildPoiContextExpansionTerms(POI_CTX);
    expect(terms.join(' ')).toMatch(/hidden|slow|easy/i);
  });

  it('rewritePoiSearchQuerySync 注入 POI 上下文到 contextualized_query', () => {
    const rewrite = rewritePoiSearchQuerySync({
      query: 'Iceland attractions',
      scene: 'poi',
      poiContext: POI_CTX,
    });
    expect(rewrite.contextualized_query).toMatch(/Iceland/i);
    expect(rewrite.contextualized_query).toMatch(/hidden|slow|easy/i);
    expect(rewrite.expansion_routes.scenario.length).toBeGreaterThan(0);
    expect(rewrite.standardized_query.destination).toBe('Iceland');
  });

  it('buildPoiSearchQueryFromContext 替代手工拼接 scenic/general', () => {
    const scenic = buildPoiSearchQueryFromContext({
      baseQuery: 'Reykjavik',
      poiSearchCtx: POI_CTX,
      gapSuffix: ' recovery easy',
      boostTerms: ['museum', 'waterfall'],
      variant: 'scenic',
    });
    expect(scenic).toMatch(/Reykjavik/i);
    expect(scenic).toMatch(/attractions|landmark|museum/i);
    expect(scenic).toMatch(/hidden|slow|recovery/i);

    const general = buildPoiSearchQueryFromContext({
      baseQuery: 'Reykjavik',
      poiSearchCtx: POI_CTX,
      variant: 'general',
    });
    expect(general).not.toMatch(/landmark museum sightseeing/);
    expect(general).toMatch(/hidden|slow/i);
  });

  it('buildPoiSearchPlanFromContext 产出多路 routes', () => {
    const plan = buildPoiSearchPlanFromContext({
      baseQuery: 'Reykjavik',
      poiSearchCtx: POI_CTX,
      variant: 'scenic',
    });
    expect(plan.routes.length).toBeGreaterThan(1);
    expect(plan.routes[0].route).toBe('primary');
    expect(plan.rewrite.expansion_routes.scenario.length).toBeGreaterThan(0);
  });

  it('applyPoiContextEnrichment 写入 standardized filters', () => {
    const enriched = applyPoiContextEnrichment(
      {
        original_query: 'test',
        contextualized_query: 'Iceland',
        expansion_routes: { synonym: [], hyponym: [], scenario: [] },
        standardized_query: {},
        confidence: 0.5,
      },
      POI_CTX,
    );
    expect(enriched.standardized_query.filters?.pacing).toBe('relaxed');
    expect(enriched.standardized_query.filters?.fatigue_score).toBe(0.5);
  });
});
