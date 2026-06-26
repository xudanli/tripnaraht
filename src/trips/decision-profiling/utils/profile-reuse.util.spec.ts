import { buildMoneyDnaSummary, formatTripLabel, isProfileStale } from './profile-reuse.util';

describe('profile-reuse.util', () => {
  it('formats trip label from name and month', () => {
    expect(
      formatTripLabel({
        name: '冰岛环岛',
        destination: 'Iceland',
        startDate: new Date('2026-05-10'),
      }),
    ).toBe('冰岛环岛 · 5月');
  });

  it('builds money dna summary', () => {
    expect(
      buildMoneyDnaSummary({
        vector: {
          experienceTendency: 0.72,
          qualityTendency: 0.5,
          timeValueTendency: 0.5,
          socialScarcityTendency: 0.5,
        },
        consumptionPace: 'balanced',
      }),
    ).toBe('体验倾向偏高 · 消费节奏均衡');
  });

  it('detects stale profile after 24 months', () => {
    const old = new Date('2023-01-01T00:00:00.000Z');
    expect(isProfileStale(old, 24)).toBe(true);
    expect(isProfileStale(new Date(), 24)).toBe(false);
  });
});
