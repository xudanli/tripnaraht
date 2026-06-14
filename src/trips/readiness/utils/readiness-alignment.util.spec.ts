import {
  assertReadinessScoreInsightAlignment,
  deriveReadinessStatusFromScore,
} from './readiness-alignment.util';

describe('readiness-alignment.util', () => {
  it('derives block status when blockers exist', () => {
    expect(deriveReadinessStatusFromScore(2, 0, 80)).toBe('block');
  });

  it('derives warn status from must items or low overall score', () => {
    expect(deriveReadinessStatusFromScore(0, 3, 80)).toBe('warn');
    expect(deriveReadinessStatusFromScore(0, 0, 65)).toBe('warn');
  });

  it('passes when counts and overall are healthy', () => {
    expect(deriveReadinessStatusFromScore(0, 0, 85)).toBe('pass');
  });

  it('detects numeric mismatches between score and insight', () => {
    const result = assertReadinessScoreInsightAlignment(
      { overall: 26, blockers: 4, must: 20, should: 6 },
      { overall: 26, blockers: 4, must: 19, should: 6, status: 'block' },
    );

    expect(result.aligned).toBe(false);
    expect(result.mismatches.some((m) => m.includes('must'))).toBe(true);
  });

  it('accepts aligned score and insight snapshots', () => {
    const score = { overall: 26, blockers: 4, must: 20, should: 6 };
    const insight = { ...score, status: 'block' as const };

    const result = assertReadinessScoreInsightAlignment(score, insight);
    expect(result.aligned).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });
});
