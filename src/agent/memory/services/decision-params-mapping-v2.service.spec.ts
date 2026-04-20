import { DecisionParamsMappingV2Service } from './decision-params-mapping-v2.service';
import { createDefaultUserTravelProfile } from '../interfaces/user-travel-profile.interface';

describe('DecisionParamsMappingV2Service', () => {
  it('cold start (no prefs) should be stable and normalized', () => {
    const svc = new DecisionParamsMappingV2Service();
    const p = createDefaultUserTravelProfile('u1');
    // Make it truly empty preference-wise
    (p as any).pacePreference = undefined;
    const out = svc.map(p);
    expect(out.params).toBeTruthy();
    const sum =
      out.params.strategyPreference.abuWeight +
      out.params.strategyPreference.drDreWeight +
      out.params.strategyPreference.neptuneWeight;
    expect(sum).toBeCloseTo(1);
  });

  it('pace SLOW should increase bufferTimeMin', () => {
    const svc = new DecisionParamsMappingV2Service();
    const p = createDefaultUserTravelProfile('u1');
    p.pacePreference = 'SLOW' as any;
    p.confidence = 1;
    const out = svc.map(p);
    expect(out.audit.some((a) => a.key === 'pacePreference')).toBe(true);
    expect((out.params.constraints.bufferTimeMin ?? 0)).toBeGreaterThan(15);
  });
});

