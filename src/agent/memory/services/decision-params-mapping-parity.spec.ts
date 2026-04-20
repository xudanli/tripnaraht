import { UserProfileMapperService } from './user-profile-mapper.service';
import { DecisionParamsMappingV2Service } from './decision-params-mapping-v2.service';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';

function roundDeep(x: any): any {
  if (x == null) return x;
  if (typeof x === 'number') return Math.round(x * 1e6) / 1e6;
  if (Array.isArray(x)) return x.map(roundDeep);
  if (typeof x === 'object') {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)]));
  }
  return x;
}

describe('DecisionParams mapping parity (legacy vs v2)', () => {
  it('should match for typical profiles', () => {
    const legacy = new UserProfileMapperService() as any;
    const v2 = new DecisionParamsMappingV2Service();

    const cases = [
      (() => {
        const p = createDefaultUserTravelProfile('u1');
        p.confidence = 0.3;
        return p;
      })(),
      (() => {
        const p = createDefaultUserTravelProfile('u2');
        p.pacePreference = 'SLOW';
        p.altitudeTolerance = 'LOW';
        p.riskTolerance = 'LOW';
        p.travelPhilosophy = 'RELAXED';
        p.confidence = 1;
        return p;
      })(),
      (() => {
        const p = createDefaultUserTravelProfile('u3');
        p.pacePreference = 'FAST';
        p.altitudeTolerance = 'HIGH';
        p.riskTolerance = 'HIGH';
        p.travelPhilosophy = 'ADVENTURE';
        p.confidence = 0.4; // multiplier=0.5
        return p;
      })(),
    ];

    for (const profile of cases) {
      const a = legacy.mapUserProfileToDecisionParams(profile);
      const b = v2.map(profile).params;
      expect(roundDeep(b)).toEqual(roundDeep(a));
    }
  });

  it('mergeDecisionParams should match legacy merge semantics', () => {
    const legacy = new UserProfileMapperService() as any;
    const v2 = new DecisionParamsMappingV2Service();

    const p1 = createDefaultUserTravelProfile('u1');
    p1.pacePreference = 'SLOW';
    p1.altitudeTolerance = 'LOW';
    p1.riskTolerance = 'LOW';
    p1.travelPhilosophy = 'RELAXED';
    p1.confidence = 1;

    const p2 = createDefaultUserTravelProfile('u2');
    p2.pacePreference = 'FAST';
    p2.altitudeTolerance = 'HIGH';
    p2.riskTolerance = 'HIGH';
    p2.travelPhilosophy = 'ADVENTURE';
    p2.confidence = 0.4;

    const dp1 = legacy.mapUserProfileToDecisionParams(p1);
    const dp2 = legacy.mapUserProfileToDecisionParams(p2);

    const a = legacy.mergeDecisionParams([dp1, dp2]);
    const b = v2.mergeDecisionParams([dp1, dp2]);
    expect(roundDeep(b)).toEqual(roundDeep(a));
  });
});

