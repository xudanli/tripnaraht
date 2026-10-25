import { buildRegistrationSeedWrites } from './registration-seed.util';

describe('buildRegistrationSeedWrites', () => {
  it('rejects empty seed', () => {
    expect(buildRegistrationSeedWrites('u1', {})).toEqual({
      ok: false,
      reason: 'empty_seed',
    });
  });

  it('builds EXPLICIT confirm drafts for hard-facing fields', () => {
    const out = buildRegistrationSeedWrites('u1', {
      pace: 'SLOW',
      riskTolerance: 'LOW',
      dietaryRestrictions: ['no_pork'],
      maxDailyDrivingHours: 3,
      hotelAvoid: ['street_facing'],
      travelPhilosophy: 'RELAXED',
    });
    expect(out.ok).toBe(true);
    if (out.ok === false) return;
    expect(out.drafts).toHaveLength(6);
    expect(out.drafts.every((d) => d.explicitConfirm === true)).toBe(true);
    expect(out.drafts.every((d) => d.source.includes('EXPLICIT'))).toBe(true);
    expect(out.drafts.find((d) => d.key === 'dietary_restrictions')?.semantic_type).toBe(
      'CONSTRAINT',
    );
    expect(out.drafts.find((d) => d.key === 'hotel_avoid')?.semantic_type).toBe(
      'AVOIDANCE',
    );
  });

  it('rejects invalid pace', () => {
    expect(
      buildRegistrationSeedWrites('u1', { pace: 'WEIRD' as 'SLOW' }),
    ).toEqual({ ok: false, reason: 'invalid_pace' });
  });
});
