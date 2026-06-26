import {
  computeReachabilityImpact,
  computeTimeImpact,
  computeTransferSlipImpact,
  maxImpactRisk,
} from './impact-algebra.util';

describe('impact-algebra', () => {
  it('absorbs delay when buffer is sufficient', () => {
    const r = computeTimeImpact({ disturbanceMinutes: 60, bufferMinutes: 90 });
    expect(r.netImpactMinutes).toBe(0);
    expect(r.fullyAbsorbed).toBe(true);
    expect(r.riskLevel).toBe('LOW');
  });

  it('propagates residual slip after buffer', () => {
    const r = computeTimeImpact({ disturbanceMinutes: 90, bufferMinutes: 30 });
    expect(r.netImpactMinutes).toBe(60);
    expect(r.absorbedMinutes).toBe(30);
    expect(r.riskLevel).toBe('MEDIUM');
  });

  it('returns null transfer impact when slack absorbs miss', () => {
    expect(computeTransferSlipImpact({ missByMinutes: 20, transferSlackMinutes: 45 })).toBeNull();
  });

  it('marks unreachable when detour misses deadline', () => {
    const deadline = Date.parse('2026-06-15T16:00:00.000Z');
    const projected = deadline + 45 * 60_000;
    const r = computeReachabilityImpact({
      detourMinutes: 30,
      deadlineMs: deadline,
      projectedArrivalMs: projected,
    });
    expect(r.reachable).toBe(false);
    expect(r.netImpactMinutes).toBeGreaterThanOrEqual(45);
    expect(maxImpactRisk('LOW', 'HIGH')).toBe('HIGH');
  });
});
