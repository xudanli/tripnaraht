import { DecisionParamsInjectorService } from './decision-params-injector.service';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';

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
    );

    const out = await injector.getDecisionParamsForUser('u1');
    expect(out.constraints.bufferTimeMin).toBe(15);

    delete process.env.DECISION_PARAMS_MAPPING_LEGACY;
    const out2 = await injector.getDecisionParamsForUser('u1');
    expect(out2.constraints.bufferTimeMin).toBe(999);
  });
});

