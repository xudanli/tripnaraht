import { resolveFeasibilityVerdict } from './feasibility-assembler.util';

describe('resolveFeasibilityVerdict monte carlo subheadline', () => {
  const summary = { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, blockers: 0 };

  it('appends monte carlo probability to subheadline when validated', () => {
    const verdict = resolveFeasibilityVerdict({
      hasValidation: true,
      isStale: false,
      summary,
      probabilisticAssessment: {
        method: 'MONTE_CARLO',
        feasibilityProbability: 0.82,
        expectedUtility: 0.71,
      },
    });
    expect(verdict.subheadline).toContain('蒙特卡洛可执行概率 82%');
    expect(verdict.subheadline).toContain('E[U]=0.71');
  });
});
