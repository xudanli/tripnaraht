import { assessMonteCarloDeterministicAlignment } from './feasibility-mc-alignment.util';

describe('assessMonteCarloDeterministicAlignment', () => {
  it('reports aligned when MC and deterministic agree on feasibility direction', () => {
    const report = assessMonteCarloDeterministicAlignment(
      { feasibilityProbability: 0.82, expectedUtility: 0.71 },
      { totalUtility: 0.68, hardViolationCount: 0 },
    );
    expect(report.aligned).toBe(true);
    expect(report.session_consistency_score).toBeGreaterThanOrEqual(75);
    expect(report.dominant_cid).toBe('ALIGNED');
  });

  it('flags direction mismatch when MC is optimistic but deterministic has hard violations', () => {
    const report = assessMonteCarloDeterministicAlignment(
      { feasibilityProbability: 0.85, expectedUtility: 0.72 },
      { totalUtility: 0.35, hardViolationCount: 2 },
    );
    expect(report.aligned).toBe(false);
    expect(report.dominant_cid).toBe('HARD_CONSTRAINT');
    expect(report.session_consistency_score).toBeLessThan(95);
    expect(report.note).toContain('不得覆盖 must_handle');
  });

  it('flags MC_DET_DIRECTION_MISMATCH when utilities disagree without hard violations', () => {
    const report = assessMonteCarloDeterministicAlignment(
      { feasibilityProbability: 0.2, expectedUtility: 0.3 },
      { totalUtility: 0.7, hardViolationCount: 0 },
    );
    expect(report.aligned).toBe(false);
    expect(report.dominant_cid).toBe('MC_DET_DIRECTION_MISMATCH');
  });
});
