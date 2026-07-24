import { evaluatePoiAccessCapacity } from './evaluate-poi-access.util';
import { ICELAND_B_TIER_ACCESS_RULES, ICELAND_B_TIER_POI_SLUGS } from '../fixtures/is-b-tier.rules';
import { ICELAND_C_TIER_POI_SLUGS } from '../fixtures/is-c-tier.crowding-profiles';
import type { PoiAccessStatusOverride } from '../interfaces/poi-access-capacity.interface';

describe('evaluatePoiAccessCapacity Phase 2', () => {
  const reynisfjaraRules = ICELAND_B_TIER_ACCESS_RULES.filter(
    (r) => r.poiId === ICELAND_B_TIER_POI_SLUGS.REYNISFJARA,
  );
  const skaftafellRules = ICELAND_B_TIER_ACCESS_RULES.filter(
    (r) => r.poiId === ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL,
  );

  it('Reynisfjara 安全规则 → FEASIBLE_WITH_RISK（SOFT）', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_B_TIER_POI_SLUGS.REYNISFJARA,
      poiName: 'Reynisfjara',
      dateISO: '2026-07-15',
      arrivalTime: '14:00',
      rules: reynisfjaraRules,
    });
    expect(result.verdict).toBe('FEASIBLE_WITH_RISK');
    expect(result.bottleneckRuleType).toBe('SAFETY_RESTRICTION');
    expect(result.reason).toMatch(/涌浪/);
  });

  it('Skaftafell S3 春季 → BLOCKED', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL,
      dateISO: '2026-05-20',
      arrivalTime: '10:00',
      rules: skaftafellRules.filter((r) => r.id === 'is.skaftafell.trail_s3_spring_closure'),
      staleRuleDays: 365,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.bottleneckResource).toBe('TRAIL');
  });

  it('Dyrhólaey 繁殖期无覆盖 → NEEDS_CONFIRMATION', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
      dateISO: '2026-06-01',
      arrivalTime: '10:00',
      rules: ICELAND_B_TIER_ACCESS_RULES.filter(
        (r) => r.id === 'is.dyrholaey.bird_breeding_window',
      ),
      staleRuleDays: 365,
    });
    expect(result.verdict).toBe('NEEDS_CONFIRMATION');
  });

  it('Dyrhólaey INACTIVE 覆盖后 → FEASIBLE', () => {
    const override: PoiAccessStatusOverride = {
      id: 'test-open',
      poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
      ruleType: 'TRAIL_RESTRICTION',
      targetResource: 'VIEWPOINT',
      effectiveFrom: '2026-05-01T00:00:00.000Z',
      effectiveTo: '2026-06-25T23:59:59.000Z',
      status: 'INACTIVE',
      sourceAuthority: 'Test',
      lastVerifiedAt: '2026-06-01T00:00:00.000Z',
      confidence: 'OFFICIAL',
    };
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
      dateISO: '2026-06-01',
      arrivalTime: '10:00',
      rules: ICELAND_B_TIER_ACCESS_RULES.filter(
        (r) => r.id === 'is.dyrholaey.bird_breeding_window',
      ),
      statusOverrides: [override],
      staleRuleDays: 365,
    });
    expect(result.verdict).toBe('FEASIBLE');
  });

  it('Seljalandsfoss 11:00 夏季 → FEASIBLE_WITH_RISK（MODEL 拥堵）', () => {
    const result = evaluatePoiAccessCapacity({
      poiId: ICELAND_C_TIER_POI_SLUGS.SELJALANDSFOSS,
      poiName: 'Seljalandsfoss',
      dateISO: '2026-07-15',
      arrivalTime: '11:00',
      rules: [],
      staleRuleDays: 365,
    });
    expect(result.verdict).toBe('FEASIBLE_WITH_RISK');
    expect(result.reason).toMatch(/基于模型推断/);
    expect(result.predictedWaitP50).toBeGreaterThanOrEqual(20);
  });
});
