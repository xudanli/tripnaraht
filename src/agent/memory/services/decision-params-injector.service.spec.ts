import { DecisionParamsInjectorService } from './decision-params-injector.service';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';
import { UserProfileMapperService } from './user-profile-mapper.service';
import { DecisionParamsMappingV2Service } from './decision-params-mapping-v2.service';
import { ShadowModeDiffService } from './shadow-mode-diff.service';
import type { EffectiveTravelerContextV1 } from '../../../travel-memory/effective-context/effective-traveler-context.types';
import { makeEffectiveMemoryItem } from '../../../travel-memory/effective-context/make-effective-memory-item.util';

describe('DecisionParamsInjectorService (shadow mode)', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  function buildInjector(opts: {
    profile?: ReturnType<typeof createDefaultUserTravelProfile>;
    memoryStore?: { get: jest.Mock };
    execStore?: { get: jest.Mock };
  }) {
    const profile = opts.profile ?? createDefaultUserTravelProfile('u1');
    return new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      new UserProfileMapperService(),
      new DecisionParamsMappingV2Service(),
      new ShadowModeDiffService(),
      undefined,
      undefined,
      opts.memoryStore as any,
      opts.execStore as any,
    );
  }

  it('SHADOW_MODE should not change output unless MAPPING_V2 enabled', async () => {
    process.env.DECISION_PARAMS_SHADOW_MODE = '1';
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW' as any;
    profile.confidence = 1;

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      {
        mapUserProfileToDecisionParams: jest.fn().mockReturnValue({
          constraints: { bufferTimeMin: 15 },
          routeDirectionBias: {
            difficultyWeight: 0.25,
            sceneryWeight: 0.25,
            adventureWeight: 0.25,
            stabilityWeight: 0.25,
          },
          strategyPreference: { abuWeight: 0.33, drDreWeight: 0.33, neptuneWeight: 0.34 },
          repairPolicy: {
            preferSplitDays: false,
            preferAltRoute: false,
            preferRestDay: false,
          },
        }),
      } as any,
      {
        map: jest.fn().mockReturnValue({
          params: {
            constraints: { bufferTimeMin: 999 },
            routeDirectionBias: {
              difficultyWeight: 0.25,
              sceneryWeight: 0.25,
              adventureWeight: 0.25,
              stabilityWeight: 0.25,
            },
            strategyPreference: { abuWeight: 0.33, drDreWeight: 0.33, neptuneWeight: 0.34 },
            repairPolicy: {
              preferSplitDays: false,
              preferAltRoute: false,
              preferRestDay: false,
            },
          },
        }),
      } as any,
      {
        diff: jest.fn().mockReturnValue({
          changedKeys: ['constraints.bufferTimeMin'],
          before: {},
          after: {},
        }),
      } as any,
      undefined,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.bufferTimeMin).toBe(15);

    delete process.env.DECISION_PARAMS_MAPPING_LEGACY;
    const out2 = await injector.getDecisionParamsForUser('u1');
    // v2 mock=999，normalizeDecisionParams 将 bufferTimeMin 钳制到 ≤120
    expect(out2.constraints.bufferTimeMin).toBe(120);
  });

  it('merges routePartyProfile.fitness_level from memory store when userId matches', async () => {
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const memoryStore = {
      get: jest.fn().mockReturnValue({
        userId: 'u1',
        routePartyProfile: { fitness_level: 'low' as const },
      }),
    };

    // Use real mapper so fitness overlay has a real baseline to mutate
    const injector = buildInjector({ profile, memoryStore });
    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.maxDailyAscentM).toBeLessThanOrEqual(480);
    expect(out.constraints.bufferTimeMin).toBeGreaterThanOrEqual(36);
    expect(memoryStore.get).toHaveBeenCalled();
  });

  it('ignores route party fitness when snapshot userId mismatches', async () => {
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const base = createDefaultDecisionParams();
    base.constraints = { maxDailyAscentM: 1000, bufferTimeMin: 15 };

    const memoryStore = {
      get: jest.fn().mockReturnValue({
        userId: 'other',
        routePartyProfile: { fitness_level: 'low' as const },
      }),
    };

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      {
        mapUserProfileToDecisionParams: jest.fn().mockImplementation(() =>
          JSON.parse(JSON.stringify(base)),
        ),
      } as any,
      { map: jest.fn().mockReturnValue({ params: JSON.parse(JSON.stringify(base)) }) } as any,
      { diff: jest.fn() } as any,
      undefined,
      undefined,
      memoryStore as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.maxDailyAscentM).toBe(1000);
  });

  it('applies iceland market prior when ICELAND_MARKET_PRIOR=1 and snapshot present', async () => {
    process.env.ICELAND_MARKET_PRIOR = '1';
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const memoryStore = {
      get: jest.fn().mockReturnValue({
        userId: 'u1',
        travelPreference: {
          iceland_market_segment: {
            segmentId: 'IS_MARKET_US',
            confidence: 0.85,
            blended: false,
            canonicalRouteId: 'IS-SOUTH-GOLDEN-5-7-LUX',
            routeDirectionTagAffinities: { 'golden-circle': 1 },
            promptBlockZh: 'test',
          },
        },
      }),
    };

    const injector = buildInjector({ profile, memoryStore });
    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.bufferTimeMin).toBeGreaterThanOrEqual(30);
    expect(out.repairPolicy.preferRestDay).toBe(true);
    delete process.env.ICELAND_MARKET_PRIOR;
  });
});

describe('DecisionParamsInjectorService (ETC M2)', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  function etcWithPace(pace: string, layer: 'L1_PERSISTENT' | 'L2_TRIP_OVERRIDE'): EffectiveTravelerContextV1 {
    const item = makeEffectiveMemoryItem({
      domain: 'PACE',
      semanticType: 'PREFERENCE',
      key: 'pace',
      value: pace,
      layer,
      confidence: 0.9,
      sourceRefs: ['test'],
    });
    return {
      schemaId: 'tripnara.effective_traveler_context@v1',
      version: 1,
      consumptionMode: layer === 'L2_TRIP_OVERRIDE' ? 'ACTIVE' : 'SHADOW',
      subjectId: 'u1',
      tripId: 'trip-1',
      resolvedAt: new Date().toISOString(),
      items: [item],
      byDomain: { PACE: [item] },
      effective: { pace: item },
      tripOverridesApplied: layer === 'L2_TRIP_OVERRIDE' ? ['pace'] : [],
      advisoryHints: [],
      provenance: {
        osProfilePresent: true,
        osBasicsPresent: false,
        osTravelPreferenceKeys: [],
        tmrStructuredKeys: [],
        tmrTripKeys: layer === 'L2_TRIP_OVERRIDE' ? ['pace'] : [],
        itemCount: 1,
        domainCount: 1,
      },
      designPrinciple: 'test',
    };
  }

  it('default off: ETC L2 pace does not change DecisionParams', async () => {
    delete process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME;
    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW';
    profile.confidence = 1;

    const execStore = {
      get: jest.fn().mockReturnValue({
        effectiveTravelerContext: etcWithPace('FAST', 'L2_TRIP_OVERRIDE'),
      }),
    };

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      new UserProfileMapperService(),
      new DecisionParamsMappingV2Service(),
      new ShadowModeDiffService(),
      undefined,
      undefined,
      undefined,
      execStore as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    // SLOW → preferRestDay true; FAST would flip that
    expect(out.repairPolicy.preferRestDay).toBe(true);
    expect(execStore.get().etcDecisionParamsAudit).toBeUndefined();
  });

  it('shadow: keeps OS params but records diff when L2 pace differs', async () => {
    process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = 'shadow';
    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW';
    profile.confidence = 1;

    const execCtx: Record<string, unknown> = {
      effectiveTravelerContext: etcWithPace('FAST', 'L2_TRIP_OVERRIDE'),
    };
    const execStore = { get: jest.fn().mockReturnValue(execCtx) };

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      new UserProfileMapperService(),
      new DecisionParamsMappingV2Service(),
      new ShadowModeDiffService(),
      undefined,
      undefined,
      undefined,
      execStore as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.repairPolicy.preferRestDay).toBe(true);
    const audit = execCtx.etcDecisionParamsAudit as {
      mode: string;
      applied: boolean;
      changedKeys: string[];
      l2Fields: string[];
    };
    expect(audit.mode).toBe('shadow');
    expect(audit.applied).toBe(false);
    expect(audit.changedKeys.length).toBeGreaterThan(0);
    expect(audit.l2Fields).toContain('pacePreference');
  });

  it('active: applies L2 FAST pace over OS SLOW', async () => {
    process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = 'active';
    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW';
    profile.confidence = 1;

    const execCtx: Record<string, unknown> = {
      effectiveTravelerContext: etcWithPace('FAST', 'L2_TRIP_OVERRIDE'),
    };
    const execStore = { get: jest.fn().mockReturnValue(execCtx) };

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      new UserProfileMapperService(),
      new DecisionParamsMappingV2Service(),
      new ShadowModeDiffService(),
      undefined,
      undefined,
      undefined,
      execStore as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.repairPolicy.preferRestDay).toBe(false);
    const audit = execCtx.etcDecisionParamsAudit as {
      mode: string;
      applied: boolean;
    };
    expect(audit.mode).toBe('active');
    expect(audit.applied).toBe(true);
  });

  it('shadow with ETC mirroring OS L1: changedKeys empty (equivalence)', async () => {
    process.env.EFFECTIVE_TRAVELER_CONTEXT_CONSUME = 'shadow';
    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW';
    profile.confidence = 1;

    const execCtx: Record<string, unknown> = {
      effectiveTravelerContext: etcWithPace('SLOW', 'L1_PERSISTENT'),
    };
    const execStore = { get: jest.fn().mockReturnValue(execCtx) };

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      new UserProfileMapperService(),
      new DecisionParamsMappingV2Service(),
      new ShadowModeDiffService(),
      undefined,
      undefined,
      undefined,
      execStore as any,
    );

    await injector.getDecisionParamsForUser('u1');
    const audit = execCtx.etcDecisionParamsAudit as { changedKeys: string[] };
    expect(audit.changedKeys).toEqual([]);
  });
});
