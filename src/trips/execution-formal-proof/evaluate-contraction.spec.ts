import { buildFormalIterationSnapshot } from './formal-snapshot';
import type { TripWorldState } from '../decision/world-model';
import { estimateStateDistance } from './estimate-contraction';
import { evaluateContraction } from './evaluate-contraction';
import { evaluateOscillationBound } from './oscillation-bound';

function minimalWorld(): TripWorldState {
  return {
    context: {
      destination: 'x',
      startDate: '2026-06-01',
      durationDays: 1,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    },
    candidatesByDate: {},
    signals: {
      lastUpdatedAt: new Date().toISOString(),
      executionTruthDAG: { nodes: [], edges: [] },
      executionIR: {
        version: '1',
        meta: {
          source: 'DAG_COMPILER' as const,
          dagId: 'd',
          compiledAt: 1,
          deterministic: true,
        },
        steps: [{ type: 'CHECK', nodeId: 'n1' }],
      },
      physicsFieldIndex: {
        byLegId: {},
        byDate: {},
        byState: { STABLE: [], DEGRADED: [], UNSTABLE: [], IMPASSABLE: [] },
      },
    },
  } as TripWorldState;
}

describe('evaluate-contraction (P-ECO-Closure-5)', () => {
  it('evaluateContraction null-prev yields benign certificate', () => {
    const w = minimalWorld();
    const snap = buildFormalIterationSnapshot(w, 0);
    const p = evaluateContraction(null, snap);
    expect(p.contractive).toBe(true);
    expect(p.suggestRollback).toBe(false);
  });

  it('identical successive snapshots imply k ≈ 0', () => {
    const w = minimalWorld();
    const a = buildFormalIterationSnapshot(w, 0);
    const b = buildFormalIterationSnapshot(w, 0);
    expect(estimateStateDistance(a, b)).toBe(0);
    const p = evaluateContraction(a, b);
    expect(p.lipschitzConstant).toBe(0);
    expect(p.contractive).toBe(true);
  });

  it('evaluateOscillationBound matches predicate', () => {
    const ob = evaluateOscillationBound({
      contractionRate: 1,
      k: 0.5,
      patchDecreasing: true,
    });
    expect(ob.oscillationBounded).toBe(true);
  });
});
