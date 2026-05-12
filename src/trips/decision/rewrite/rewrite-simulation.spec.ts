import { evaluateRewriteSimulation } from './evaluate-rewrite-simulation';
import { evaluateRewriteCommitReadiness } from './rewrite-commit-gates';

describe('evaluateRewriteSimulation', () => {
  it('returns hypothetical branch metadata without mutating external state', () => {
    const sim = evaluateRewriteSimulation({
      sourceProposalId: 'prop_1',
      kind: 'OVERNIGHT_RELOCATION',
      affectedDays: ['2026-11-04'],
      operations: ['MOVE_OVERNIGHT', 'SHIFT_NEXT_DAY_START'],
    });
    expect(sim.rewriteId).toMatch(/^rsim_/);
    expect(sim.verdict).toBe('NEUTRAL');
    expect(sim.operations).toContain('MOVE_OVERNIGHT');
  });
});

describe('evaluateRewriteCommitReadiness', () => {
  it('requires IMPROVED verdict and both approval keys', () => {
    const sim = {
      rewriteId: 'x',
      kind: 'OTHER' as const,
      affectedDays: [],
      operations: [],
      projectedSignals: {},
      projectedConstraintChanges: { resolvedViolations: [], introducedViolations: [] },
      verdict: 'IMPROVED' as const,
      confidence: 0.9,
    };
    const denied = evaluateRewriteCommitReadiness(sim, {});
    expect(denied.allowed).toBe(false);

    const ok = evaluateRewriteCommitReadiness(sim, {
      migrationEconomicsApproved: true,
      restructuringPressureApproved: true,
    });
    expect(ok.allowed).toBe(true);
  });
});
