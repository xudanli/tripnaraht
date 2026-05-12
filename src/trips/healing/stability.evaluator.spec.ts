import { evaluateStability, isStableSnapshot } from './stability.evaluator';

describe('evaluateStability', () => {
  it('returns stable when no high severity, medium under cap, low velocity', () => {
    const r = evaluateStability({
      deltaCount: 1,
      highSeverityIssues: 0,
      mediumIssues: 1,
      deltaVelocity: 2,
      pendingReplans: 0,
    });
    expect(r.stable).toBe(true);
    expect(r.score).toBeGreaterThan(0.85);
  });

  it('returns unstable when high severity issues present', () => {
    const r = evaluateStability({
      deltaCount: 2,
      highSeverityIssues: 1,
      mediumIssues: 0,
      deltaVelocity: 0,
      pendingReplans: 1,
    });
    expect(r.stable).toBe(false);
  });
});

describe('isStableSnapshot', () => {
  it('matches strict triple zero', () => {
    expect(
      isStableSnapshot({
        deltaCount: 0,
        highSeverityIssues: 0,
        mediumIssues: 0,
        deltaVelocity: 0,
        pendingReplans: 0,
      }),
    ).toBe(true);
  });
});
