import { fingerprintRoutePlan, planFingerprintChanged } from './plan-fingerprint.util';
import type { RoutePlanDraft } from './world-model.types';

describe('plan-fingerprint.util', () => {
  const base = (segments: Array<{ id: string; poiId?: string }>): RoutePlanDraft => ({
    tripId: 'trip-a',
    routeDirectionId: 'rd-1',
    segments: segments as RoutePlanDraft['segments'],
  });

  it('fingerprintRoutePlan is stable for same segments', () => {
    const p = base([{ id: 'b' }, { id: 'a' }]);
    expect(fingerprintRoutePlan(p)).toBe(fingerprintRoutePlan(base([{ id: 'a' }, { id: 'b' }])));
  });

  it('planFingerprintChanged detects segment swap', () => {
    const before = base([{ id: 's1' }]);
    const after = base([{ id: 's2', poiId: 'p2' }]);
    expect(planFingerprintChanged(before, after)).toBe(true);
    expect(planFingerprintChanged(before, before)).toBe(false);
  });
});
