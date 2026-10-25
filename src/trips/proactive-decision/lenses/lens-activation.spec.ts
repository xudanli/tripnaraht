import {
  evaluateLensActivation,
  planLensesForProactiveCase,
} from './evaluate-lens-activation.util';
import {
  assertHardGateNotOverridden,
  HardGateOverrideError,
  isRecommendationAllowedUnderHardGate,
} from './assert-hard-gate-invariant.util';

describe('PD-4 Lens Activation Policy', () => {
  it('weather continue: Abu+Dre on, Neptune off when Need Alternative=false', () => {
    const plan = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: false,
    });

    expect(plan.activateAbu).toBe(true);
    expect(plan.activateDrDre).toBe(true);
    expect(plan.activateNeptune).toBe(false);
    expect(plan.lensOrder).toEqual(['ABU', 'DR_DRE']);
    expect(plan.requirePostRepairRecheck).toBe(false);
  });

  it('weather continue: Neptune on when Need Alternative=true', () => {
    const plan = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: true,
    });
    expect(plan.activateNeptune).toBe(true);
    expect(plan.lensOrder).toEqual(['ABU', 'DR_DRE', 'NEPTUNE']);
  });

  it('reroute / postpone defaults to Neptune', () => {
    const reroute = planLensesForProactiveCase({
      caseId: 'CASE_REROUTE',
      signalKind: 'ROAD_DIFFICULTY_CHANGE',
    });
    expect(reroute.activateNeptune).toBe(true);
    expect(reroute.activateAbu).toBe(true);

    const postpone = planLensesForProactiveCase({
      caseId: 'CASE_POSTPONE_ACTIVITY',
      signalKind: 'WEATHER_BLIZZARD',
    });
    expect(postpone.activateNeptune).toBe(true);
  });

  it('mustRepair forces full chain + post-repair recheck', () => {
    const plan = planLensesForProactiveCase({
      caseId: 'CASE_CONTINUE_ACTIVITY',
      signalKind: 'WEATHER_WIND',
      needAlternative: false,
      mustRepair: true,
    });
    expect(plan.lensOrder).toEqual(['ABU', 'DR_DRE', 'NEPTUNE']);
    expect(plan.requirePostRepairRecheck).toBe(true);
  });

  it('mustAdjust forces full chain', () => {
    const plan = evaluateLensActivation({
      triggers: ['weather_risk'],
      needAlternative: false,
      mustAdjust: true,
    });
    expect(plan.activateAbu).toBe(true);
    expect(plan.activateDrDre).toBe(true);
    expect(plan.activateNeptune).toBe(true);
    expect(plan.requirePostRepairRecheck).toBe(true);
  });

  it('Hard Gate: recommendation cannot override HARD_BLOCK', () => {
    expect(
      isRecommendationAllowedUnderHardGate({
        abuVerdict: 'HARD_BLOCK',
        recommendationOverridesHardBlock: true,
      }),
    ).toBe(false);

    expect(() =>
      assertHardGateNotOverridden({
        abuVerdict: 'HARD_BLOCK',
        recommendationOverridesHardBlock: true,
      }),
    ).toThrow(HardGateOverrideError);

    expect(
      isRecommendationAllowedUnderHardGate({
        abuVerdict: 'HARD_BLOCK',
        recommendationOverridesHardBlock: false,
      }),
    ).toBe(true);

    expect(
      isRecommendationAllowedUnderHardGate({
        abuVerdict: 'ALLOW',
        recommendationOverridesHardBlock: true,
      }),
    ).toBe(true);
  });
});
