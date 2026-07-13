import { buildImpactWindowBucket, buildRiskKey, deriveRiskId, bucketImpactWindow } from './risk-key.util';

describe('risk-key.util', () => {
  const base = {
    tripId: 'trip_001',
    type: 'ENVIRONMENT' as const,
    code: 'WEATHER_STRONG_WIND' as const,
    normalizedSubject: 'activity_glacier_walk',
    affectedScope: 'activity_glacier_walk',
    impactStartAt: '2026-07-08T11:00:00.000Z',
    impactEndAt: '2026-07-08T18:00:00.000Z',
  };

  it('builds stable riskKey for same inputs', () => {
    expect(buildRiskKey(base)).toBe(buildRiskKey(base));
  });

  it('changes riskKey when impact window bucket changes', () => {
    const a = buildRiskKey(base);
    const b = buildRiskKey({
      ...base,
      impactStartAt: '2026-07-09T11:00:00.000Z',
      impactEndAt: '2026-07-09T18:00:00.000Z',
    });
    expect(a).not.toBe(b);
  });

  it('derives stable riskId from tripId + riskKey', () => {
    const key = buildRiskKey(base);
    expect(deriveRiskId('trip_001', key)).toMatch(/^risk_[a-f0-9]{16}$/);
    expect(deriveRiskId('trip_001', key)).toBe(deriveRiskId('trip_001', key));
    expect(deriveRiskId('trip_002', key)).not.toBe(deriveRiskId('trip_001', key));
  });

  it('buckets impact windows to hour granularity', () => {
    const bucket = buildImpactWindowBucket({
      impactStartAt: '2026-07-08T11:23:00.000Z',
      impactEndAt: '2026-07-08T18:45:00.000Z',
    });
    expect(bucket).toContain(bucketImpactWindow('2026-07-08T11:00:00.000Z'));
  });
});
