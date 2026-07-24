import { DecisionParamsInjectorService } from './decision-params-injector.service';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { createDefaultDecisionParams } from '../interfaces/decision-params.interface';

describe('DecisionParamsInjectorService (shadow mode)', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('SHADOW_MODE should not change output unless MAPPING_V2 enabled', async () => {
    process.env.DECISION_PARAMS_SHADOW_MODE = '1';
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    profile.pacePreference = 'SLOW' as any;
    profile.confidence = 1;

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      { mapUserProfileToDecisionParams: jest.fn().mockReturnValue({ constraints: { bufferTimeMin: 15 }, routeDirectionBias: { difficultyWeight: 0.25, sceneryWeight: 0.25, adventureWeight: 0.25, stabilityWeight: 0.25 }, strategyPreference: { abuWeight: 0.33, drDreWeight: 0.33, neptuneWeight: 0.34 }, repairPolicy: { preferSplitDays: false, preferAltRoute: false, preferRestDay: false } }) } as any,
      { map: jest.fn().mockReturnValue({ params: { constraints: { bufferTimeMin: 999 }, routeDirectionBias: { difficultyWeight: 0.25, sceneryWeight: 0.25, adventureWeight: 0.25, stabilityWeight: 0.25 }, strategyPreference: { abuWeight: 0.33, drDreWeight: 0.33, neptuneWeight: 0.34 }, repairPolicy: { preferSplitDays: false, preferAltRoute: false, preferRestDay: false } } }) } as any,
      { diff: jest.fn().mockReturnValue({ changedKeys: ['constraints.bufferTimeMin'], before: {}, after: {} }) } as any,
      undefined,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.bufferTimeMin).toBe(15);

    delete process.env.DECISION_PARAMS_MAPPING_LEGACY;
    const out2 = await injector.getDecisionParamsForUser('u1');
    expect(out2.constraints.bufferTimeMin).toBe(120);
  });

  it('merges routePartyProfile.fitness_level from memory store when userId matches', async () => {
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const base = createDefaultDecisionParams();
    base.constraints = { maxDailyAscentM: 1000, bufferTimeMin: 15 };

    const store = {
      get: jest.fn().mockReturnValue({
        userId: 'u1',
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
      store as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.maxDailyAscentM).toBeLessThanOrEqual(480);
    expect(out.constraints.bufferTimeMin).toBeGreaterThanOrEqual(36);
    expect(store.get).toHaveBeenCalled();
  });

  it('ignores route party fitness when snapshot userId mismatches', async () => {
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const base = createDefaultDecisionParams();
    base.constraints = { maxDailyAscentM: 1000, bufferTimeMin: 15 };

    const store = {
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
      store as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.maxDailyAscentM).toBe(1000);
  });

  it('applies iceland market prior when ICELAND_MARKET_PRIOR=1 and snapshot present', async () => {
    process.env.ICELAND_MARKET_PRIOR = '1';
    process.env.DECISION_PARAMS_MAPPING_LEGACY = '1';

    const profile = createDefaultUserTravelProfile('u1');
    const base = createDefaultDecisionParams();

    const store = {
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

    const injector = new DecisionParamsInjectorService(
      { getUserTravelProfile: jest.fn().mockResolvedValue(profile) } as any,
      {
        mapUserProfileToDecisionParams: jest.fn().mockImplementation(() =>
          JSON.parse(JSON.stringify(base)),
        ),
      } as any,
      { map: jest.fn().mockReturnValue({ params: JSON.parse(JSON.stringify(base)) }) } as any,
      { diff: jest.fn() } as any,
      store as any,
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.bufferTimeMin).toBeGreaterThanOrEqual(30);
    expect(out.repairPolicy.preferRestDay).toBe(true);
    delete process.env.ICELAND_MARKET_PRIOR;
  });
});

