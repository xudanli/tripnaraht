import { buildStubReadinessFromSnapshot } from './feasibility-readiness-stub.util';

describe('buildStubReadinessFromSnapshot', () => {
  it('uses snapshot overallScore when present', () => {
    const readiness = buildStubReadinessFromSnapshot('trip-1', { overallScore: 82 });
    expect(readiness.score.overall).toBe(82);
    expect(readiness.findings).toEqual([]);
  });

  it('defaults to 75 when snapshot missing', () => {
    const readiness = buildStubReadinessFromSnapshot('trip-1', null);
    expect(readiness.score.overall).toBe(75);
  });
});
