import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import {
  computeNeptuneResidualDelta,
  evaluateSinglePassConvergence,
  evaluateTwoPassConvergence,
  manifoldViolation,
  stabilityManifoldScore,
} from './evaluate-convergence';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';

function mkClosure(p: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  const thresholds = { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 };
  return {
    ecoDriftScore: 0.2,
    stabilityScore: 0.85,
    semanticConvergence: 0.75,
    shouldRerunNeptune: false,
    reasons: [],
    thresholds,
    ...p,
  };
}

function mkNeptune(
  slotIds: string[],
  triggerCodes: Array<'WEATHER' | 'PHYSICS_DEGRADED_PRESSURE'>,
  pathCost: number,
  ok: boolean,
): NeptuneRepairResult {
  return {
    plan: { version: '1', createdAt: '', days: [] },
    triggers: triggerCodes.map(code => ({ code, date: undefined, slotId: undefined, details: {} })),
    changedSlotIds: slotIds,
    explanation: '',
    irVm: { pathCost, ok },
    bytecode: { version: '1', dagId: 'd', instructions: [] },
    executionTrace: [],
  } as NeptuneRepairResult;
}

describe('evaluate-convergence (P-ECO-Closure-3)', () => {
  it('computeNeptuneResidualDelta is 0 for identical bundles', () => {
    const r = mkNeptune(['a'], ['WEATHER'], 3, true);
    expect(computeNeptuneResidualDelta(r, r)).toBe(0);
  });

  it('evaluateSinglePassConvergence marks fixed point when inside manifold and no rerun', () => {
    const c = mkClosure({
      shouldRerunNeptune: false,
      ecoDriftScore: 0.2,
      stabilityScore: 0.85,
      semanticConvergence: 0.75,
    });
    const out = evaluateSinglePassConvergence(c, { epsilonManifold: 0.08 });
    expect(out.isFixedPoint).toBe(true);
    expect(out.residualDelta).toBe(0);
  });

  it('evaluateTwoPassConvergence detects contraction when instability drops', () => {
    const n1 = mkNeptune(['s1'], ['WEATHER'], 10, true);
    const n2 = mkNeptune(['s1'], ['WEATHER'], 10, true);
    const c1 = mkClosure({
      ecoDriftScore: 0.5,
      stabilityScore: 0.5,
      semanticConvergence: 0.5,
      shouldRerunNeptune: true,
    });
    const c2 = mkClosure({
      ecoDriftScore: 0.2,
      stabilityScore: 0.85,
      semanticConvergence: 0.75,
      shouldRerunNeptune: false,
    });
    const out = evaluateTwoPassConvergence(n1, n2, c1, c2, {
      epsilonResidual: 0.06,
      epsilonManifold: 0.08,
    });
    expect(out.residualDelta).toBeLessThan(0.01);
    expect(out.contractionRate).toBeGreaterThan(0);
    expect(out.isFixedPoint).toBe(true);
  });

  it('manifoldViolation is zero when metrics satisfy thresholds', () => {
    const c = mkClosure({
      ecoDriftScore: 0.3,
      stabilityScore: 0.75,
      semanticConvergence: 0.65,
    });
    expect(manifoldViolation(c)).toBe(0);
    expect(stabilityManifoldScore(c)).toBeGreaterThan(0.9);
  });
});
