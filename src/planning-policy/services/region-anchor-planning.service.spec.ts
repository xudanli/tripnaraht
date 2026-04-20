import { Test } from '@nestjs/testing';
import { RegionAnchorPlanningService } from './region-anchor-planning.service';
import { RegionIntentResolverService } from './region-intent-resolver.service';
import { GOLDEN_CIRCLE_INTENT } from '../regions/iceland-region-intents';

describe('RegionIntentResolverService', () => {
  let resolver: RegionIntentResolverService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RegionIntentResolverService],
    }).compile();
    resolver = moduleRef.get(RegionIntentResolverService);
  });

  it('resolves golden_circle by id', () => {
    const r = resolver.resolveFromRegionId('golden_circle');
    expect(r?.requiredAnchorPoiIds).toEqual([
      'thingvellir',
      'geysir',
      'gullfoss',
    ]);
  });

  it('matches Chinese query with high confidence', () => {
    const hit = resolver.resolveFromText('明天冰岛黄金圈一日游，轻松一点');
    expect(hit.matchedRegionId).toBe('golden_circle');
    expect(hit.regionIntent?.regionId).toBe('golden_circle');
    expect(hit.confidence).toBeGreaterThan(0.85);
  });
});

describe('RegionAnchorPlanningService', () => {
  let planning: RegionAnchorPlanningService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RegionIntentResolverService, RegionAnchorPlanningService],
    }).compile();
    planning = moduleRef.get(RegionAnchorPlanningService);
  });

  it('injects anchors and computes schedule feasibility', () => {
    const slice = planning.buildPoiPlanningSlice(
      GOLDEN_CIRCLE_INTENT,
      { pace: 'relaxed', totalBudgetMinutes: 600 },
      0.9,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice.poiPlan?.requiredAnchorPoiIds).toEqual([
      'thingvellir',
      'geysir',
      'gullfoss',
    ]);
    expect(slice.poiPlan?.optionalCandidatePoiIds).toContain('secret_lagoon');
    expect(slice.schedulePlan?.totalBudgetMinutes).toBe(600);
    expect(slice.schedulePlan?.feasibility).toBeDefined();
  });

  it('merges mustInclude into required anchors', () => {
    const slice = planning.buildPoiPlanningSlice(
      GOLDEN_CIRCLE_INTENT,
      {
        mustIncludePoiIds: ['secret_lagoon'],
        totalBudgetMinutes: 720,
        pace: 'normal',
      },
      0.9,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice.poiPlan?.requiredAnchorPoiIds).toContain('secret_lagoon');
    expect(slice.poiPlan?.optionalCandidatePoiIds).not.toContain('secret_lagoon');
  });

  it('resolveAndBuildSlice uses regionId from user', () => {
    const slice = planning.resolveAndBuildSlice(
      { regionId: 'golden_circle', totalBudgetMinutes: 600, pace: 'relaxed' },
      undefined,
      { estimatedDriveMinutes: 200, mealMinutes: 60 },
    );
    expect(slice?.routeIntent?.regionId).toBe('golden_circle');
    expect(slice?.poiPlan?.requiredAnchorPoiIds.length).toBeGreaterThanOrEqual(3);
  });
});
