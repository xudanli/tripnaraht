import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import {
  computeWorldDivergence,
  generateExecutionWorlds,
  selectStableWorld,
  simulateWorlds,
  stableWorldObjective,
} from './index';

function minimalDag(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:a',
        date: '2026-06-01',
        slotId: 's',
        type: 'LEG',
        execution: {
          finalState: 'OK',
          delayMinutes: 10,
          reliabilityScore: 0.9,
        },
        temporal: {
          daylightViolation: false,
          crossDayRisk: 0,
          arrivalRisk: 0.1,
        },
        weather: { exposureScore: 0.1 },
        road: { accessibility: 1 },
      },
    ],
    edges: [],
  };
}

describe('multiverse (P17)', () => {
  it('generates N worlds with uniform probability and distinct structural IDs when n>1', () => {
    const base = minimalDag();
    const worlds = generateExecutionWorlds(base, undefined, 4);
    expect(worlds).toHaveLength(4);
    expect(worlds[0]!.probability).toBeCloseTo(0.25);
    expect(worlds[0]!.ir.meta.dagId).not.toBe(worlds[1]!.ir.meta.dagId);
  });

  it('computes divergence vs baseline and selects stable world', () => {
    const base = minimalDag();
    const worlds = computeWorldDivergence(generateExecutionWorlds(base, undefined, 3));
    expect(worlds[0]!.divergenceScore).toBe(0);
    expect(worlds[1]!.divergenceScore).toBeGreaterThan(0);

    const results = simulateWorlds(worlds);
    const pick = selectStableWorld(results);
    expect(pick.worldId).toBeDefined();
    const best = Math.max(...results.map(stableWorldObjective));
    expect(stableWorldObjective(pick)).toBe(best);
  });

  it('world w0 matches compile of base DAG when seed 0 clone', () => {
    const base = minimalDag();
    const worlds = generateExecutionWorlds(base, undefined, 1);
    const ir0 = compileDAGToIR(base);
    expect(worlds[0]!.ir.meta.dagId).toBe(ir0.meta.dagId);
  });
});
