/**
 * Phase 1.6：结果型验证（slice + 模拟最终选中 slug），不依赖 DB / 完整 itinerary
 */
import { Test } from '@nestjs/testing';
import { RegionAnchorPlanningService } from './services/region-anchor-planning.service';
import { RegionIntentResolverService } from './services/region-intent-resolver.service';
import { computePoiPlanningOutcomeMetrics } from './utils/poi-planning-outcome-metrics.util';

describe('POI region intent outcome validation (Case E–H)', () => {
  let planning: RegionAnchorPlanningService;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [RegionIntentResolverService, RegionAnchorPlanningService],
    }).compile();
    planning = m.get(RegionAnchorPlanningService);
  });

  /**
   * Case E：黄金圈 10 小时、正常预算
   * 预期：3 anchors 全在必选；feasibility ok 时 optional 池非空；模拟最终含 3 anchor + 1–2 optional 时指标通过
   */
  it('Case E: 10h normal — full anchor coverage, optional 1–2 in range', () => {
    const slice = planning.resolveAndBuildSlice(
      {
        regionId: 'golden_circle',
        totalBudgetMinutes: 600,
        pace: 'normal',
      },
      undefined,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice?.schedulePlan?.feasibility).toBe('ok');
    expect(slice?.poiPlan?.requiredAnchorPoiIds).toEqual([
      'thingvellir',
      'geysir',
      'gullfoss',
    ]);
    const optN = slice?.poiPlan?.optionalCandidatePoiIds?.length ?? 0;
    expect(optN).toBeGreaterThanOrEqual(1);

    const optionalPick = (slice!.poiPlan!.optionalCandidatePoiIds ?? []).slice(0, 2);
    const finalSlugs = [
      ...(slice!.poiPlan!.requiredAnchorPoiIds ?? []),
      ...optionalPick,
    ];
    const m = computePoiPlanningOutcomeMetrics(slice!, finalSlugs, {
      maxOptionalWhenFeasibilityOk: 2,
    });
    expect(m.anchorCoverage.rate).toBe(1);
    expect(m.anchorCoverage.missing).toHaveLength(0);
    expect(m.optionalOverflow.selectedOptionalCount).toBeLessThanOrEqual(2);
    expect(m.optionalOverflow.overflow).toBe(false);
    expect(m.budgetGateCorrect).toBe(true);
  });

  /**
   * Case F：黄金圈 6 小时
   * 预期：anchors 仍在 required；optional 被门控清空；budgetGateCorrect
   */
  it('Case F: 6h — tight budget clears optional pool', () => {
    const slice = planning.resolveAndBuildSlice(
      {
        regionId: 'golden_circle',
        totalBudgetMinutes: 360,
        pace: 'normal',
      },
      undefined,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice?.poiPlan?.requiredAnchorPoiIds?.length).toBe(3);
    expect(slice?.poiPlan?.optionalCandidatePoiIds?.length ?? 0).toBe(0);
    expect(slice?.budgetGateApplied).toBe(true);
    const finalSlugs = slice!.poiPlan!.requiredAnchorPoiIds ?? [];
    const metrics = computePoiPlanningOutcomeMetrics(slice!, finalSlugs);
    expect(metrics.budgetGateCorrect).toBe(true);
    expect(metrics.optionalOverflow.selectedOptionalCount).toBe(0);
  });

  /**
   * Case G：exclude 某补充点 — 不得进入 optional 与最终集合
   */
  it('Case G: exclude kerid — no leakage in metrics', () => {
    const slice = planning.resolveAndBuildSlice(
      {
        regionId: 'golden_circle',
        excludePoiIds: ['kerid_crater'],
        totalBudgetMinutes: 600,
        pace: 'normal',
      },
      undefined,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice?.poiPlan?.optionalCandidatePoiIds).not.toContain('kerid_crater');
    expect(slice?.poiPlan?.excludedPoiIds).toContain('kerid_crater');

    const badFinal = [
      'thingvellir',
      'geysir',
      'gullfoss',
      'kerid_crater',
    ];
    const g = computePoiPlanningOutcomeMetrics(slice!, badFinal);
    expect(g.excludedLeakage.leaked).toContain('kerid_crater');

    const goodFinal = ['thingvellir', 'geysir', 'gullfoss', 'secret_lagoon'];
    const g2 = computePoiPlanningOutcomeMetrics(slice!, goodFinal);
    expect(g2.excludedLeakage.leaked).toHaveLength(0);
  });

  /**
   * Case H：无 region — 不生成 slice；metrics 标记 noPoiPlanning，不强行判 anchor
   */
  it('Case H: no region — no slice, no forced metrics', () => {
    const slice = planning.resolveAndBuildSlice(
      { totalBudgetMinutes: 480, pace: 'normal' },
      '只在雷克雅未克市区呆两天，博物馆为主',
    );
    expect(slice).toBeUndefined();
    const m = computePoiPlanningOutcomeMetrics(undefined, [
      'some_poi',
      'other',
    ]);
    expect(m.noPoiPlanning).toBe(true);
  });
});
