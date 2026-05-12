import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import type { ExecutionStateSnapshot } from './execution-convergence.types';
import {
  buildExecutionStateSnapshot,
  evaluateFixedPoint,
  shouldContinueIteration,
} from './execution-fixed-point';
import { buildConvergenceManifold } from './execution-convergence-manifold';

function closure(p: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0.2,
    stabilityScore: 0.85,
    semanticConvergence: 0.75,
    shouldRerunNeptune: false,
    reasons: [],
    thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
    ...p,
  };
}

function neptune(slots: string[], cost: number): NeptuneRepairResult {
  return {
    plan: { version: '1', createdAt: '', days: [] },
    triggers: [],
    changedSlotIds: slots,
    explanation: '',
    irVm: { pathCost: cost, ok: true },
    bytecode: { version: '1', dagId: 'd', instructions: [] },
    executionTrace: [],
  } as NeptuneRepairResult;
}

describe('execution-fixed-point', () => {
  it('pass-1 fixed point when manifold interior', () => {
    const c = closure({ shouldRerunNeptune: false });
    const n = neptune([], 1);
    const fp = evaluateFixedPoint(null, n, c, { epsilonManifold: 0.08 });
    expect(fp.iterationIndex).toBe(1);
    expect(fp.isFixedPoint).toBe(true);
    expect(shouldContinueIteration(fp)).toBe(false);
  });

  it('two-pass contractionRate reflects residual shrink', () => {
    const c1 = closure({
      shouldRerunNeptune: true,
      ecoDriftScore: 0.6,
      stabilityScore: 0.5,
      semanticConvergence: 0.4,
    });
    const n1 = neptune(['a'], 10);
    const snap = buildExecutionStateSnapshot(1, n1, c1);

    const c2 = closure({ shouldRerunNeptune: false });
    const n2 = neptune(['a'], 10);
    const fp = evaluateFixedPoint(snap, n2, c2);
    expect(fp.contractionRate).toBe(1);
    expect(fp.iterationIndex).toBe(2);
  });

  it('buildConvergenceManifold detects strict contraction', () => {
    const cBad = closure({
      shouldRerunNeptune: true,
      ecoDriftScore: 0.55,
      stabilityScore: 0.55,
      semanticConvergence: 0.55,
    });
    const s1 = buildExecutionStateSnapshot(1, neptune([], 1), cBad);
    const s2: ExecutionStateSnapshot = {
      iterationIndex: 2,
      residualDelta: Math.min(0.05, s1.residualDelta / 2),
      neptune: neptune([], 1),
      closureInstability: 0.05,
      stateHash: 'b'.repeat(32),
    };
    const m = buildConvergenceManifold([s1, s2]);
    expect(m.residualTrajectory).toHaveLength(2);
    expect(m.contractionVector).toEqual([1]);
    expect(m.isContractiveSystem).toBe(true);
  });
});
