import { buildCandidateRetrievalQueryPlan } from './build-candidate-retrieval-query-plan.util';
import type { PoiPlanningDecisionSlice } from '../../decision/kernel/decision-state.types';

describe('buildCandidateRetrievalQueryPlan', () => {
  const gcSlice: PoiPlanningDecisionSlice = {
    routeIntent: { regionId: 'golden_circle', confidence: 0.9 },
    poiPlan: {
      requiredAnchorPoiIds: ['thingvellir', 'geysir', 'gullfoss'],
      optionalCandidatePoiIds: [],
      excludedPoiIds: [],
      selectedOptionalPoiIds: [],
    },
    schedulePlan: {
      totalBudgetMinutes: 600,
      requiredCostMinutes: 400,
      optionalCapacityMinutes: 120,
      bufferMinutes: 60,
      feasibility: 'ok',
    },
    resolution: { source: 'region_intent_resolver', matchedBy: 'message_text' },
    budgetGateApplied: false,
  };

  it('黄金圈：boostedTerms 含三锚点相关词，regionTags 含 golden_circle', () => {
    const plan = buildCandidateRetrievalQueryPlan(
      '明天冰岛黄金圈',
      'Reykjavik, Iceland',
      gcSlice,
    );
    const joined = plan.boostedTerms.join(' ').toLowerCase();
    expect(joined).toContain('thingvellir');
    expect(joined).toContain('geysir');
    expect(joined).toContain('gullfoss');
    expect(plan.regionTags).toContain('golden_circle');
    expect(plan.requiredAnchorSlugs).toEqual(['thingvellir', 'geysir', 'gullfoss']);
    /** Phase 3.2：profile 为 geysir/gullfoss 增补的区名也应进入 boostedTerms */
    expect(joined).toContain('haukadalur');
    expect(joined).toContain('strokkur');
  });

  it('用户文案含西峡湾：boostedTerms 含 Westfjords 相关词，regionTags 含 westfjords', () => {
    const plan = buildCandidateRetrievalQueryPlan(
      '雷克雅未克到西峡湾这段想坐小飞机',
      '冰岛',
      undefined,
    );
    const joined = plan.boostedTerms.join(' ').toLowerCase();
    expect(plan.regionTags).toContain('westfjords');
    expect(joined).toContain('westfjords');
    expect(joined).toContain('ísafjörður');
  });
});
