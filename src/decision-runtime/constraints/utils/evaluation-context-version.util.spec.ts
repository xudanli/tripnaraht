import { resolveEvaluationContextVersion } from './evaluation-context-version.util';

describe('evaluation-context-version.util', () => {
  it('CAS-004: resolves four-dimensional version from trip metadata', () => {
    const v = resolveEvaluationContextVersion({
      tripId: 'trip-1',
      metadata: { constraintsVersion: 3 },
      updatedAt: new Date('2026-07-03T12:00:00.000Z'),
      countryCode: 'IS',
    });
    expect(v.policyVersion).toBe(3);
    expect(v.planVersionId).toMatch(/^plan_/);
    expect(v.rulePackVersion).toContain('destination.is@');
    expect(v.worldRevision).toContain('2026-07-03');
  });
});
