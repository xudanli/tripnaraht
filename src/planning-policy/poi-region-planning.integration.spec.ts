/**
 * Phase 1：区域意图 → poiPlanning → 预算门控（端到端逻辑，不依赖 DB）
 */
import { Test } from '@nestjs/testing';
import { RegionAnchorPlanningService } from './services/region-anchor-planning.service';
import { RegionIntentResolverService } from './services/region-intent-resolver.service';
import { GOLDEN_CIRCLE_INTENT } from './regions/iceland-region-intents';

describe('POI region planning integration (Case A/B/C)', () => {
  let planning: RegionAnchorPlanningService;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [RegionIntentResolverService, RegionAnchorPlanningService],
    }).compile();
    planning = m.get(RegionAnchorPlanningService);
  });

  /** Case A：明天黄金圈一日游，轻松一点 */
  it('Case A: query hits golden_circle and three anchors in requiredAnchorPoiIds', () => {
    const slice = planning.resolveAndBuildSlice(
      { pace: 'relaxed', totalBudgetMinutes: 600 },
      '明天冰岛黄金圈一日游，轻松一点',
    );
    expect(slice?.routeIntent?.regionId).toBe('golden_circle');
    expect(slice?.resolution?.matchedBy).toBe('message_text');
    expect(slice?.resolution?.source).toBe('region_intent_resolver');
    expect(slice?.poiPlan?.requiredAnchorPoiIds).toEqual([
      'thingvellir',
      'geysir',
      'gullfoss',
    ]);
    expect(slice?.schedulePlan?.feasibility).not.toBe('failed');
  });

  /** Case B：必须 Secret Lagoon — slug 合并进必选且不被预算门控误删 */
  it('Case B: mustInclude secret_lagoon stays required and optional list excludes it', () => {
    const slice = planning.resolveAndBuildSlice(
      {
        regionId: 'golden_circle',
        mustIncludePoiIds: ['secret_lagoon'],
        totalBudgetMinutes: 720,
        pace: 'normal',
      },
      undefined,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice?.poiPlan?.requiredAnchorPoiIds).toContain('secret_lagoon');
    expect(slice?.poiPlan?.optionalCandidatePoiIds).not.toContain('secret_lagoon');
  });

  /** Case C：半日 4 小时 — 紧/失败时不带 optional */
  it('Case C: 4h budget yields tight/failed and optional candidates cleared', () => {
    const raw = planning.buildPoiPlanningSlice(
      GOLDEN_CIRCLE_INTENT,
      { totalBudgetMinutes: 240, pace: 'relaxed' },
      0.9,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    const feas = raw.schedulePlan?.feasibility;
    expect(feas === 'tight' || feas === 'failed').toBe(true);
    expect(raw.poiPlan?.optionalCandidatePoiIds?.length ?? 0).toBe(0);
    expect(raw.budgetGateApplied).toBe(true);
    expect(raw.appliedBackoffSteps).toContain('MINIMAL_BUDGET_DROP_OPTIONAL_CANDIDATES');
    expect(raw.narrationHint).toBeDefined();
  });

  /** Case D：无区域命中 — 不生成 poiPlanning（增量约束不污染全局） */
  it('Case D: generic query does not produce poiPlanning', () => {
    const slice = planning.resolveAndBuildSlice(
      { pace: 'normal', totalBudgetMinutes: 480 },
      '下周去东京市区随便逛逛，吃好吃的',
    );
    expect(slice).toBeUndefined();
  });
});
