import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import {
  detectStabilityDrifts,
  evaluateStability,
  runExecutionStabilityCycle,
  STABILITY_GLOBAL_THRESHOLD,
} from './index';

function minimalDag(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:x',
        date: '2026-06-01',
        slotId: 's',
        type: 'LEG',
        execution: {
          finalState: 'OK',
          delayMinutes: 0,
          reliabilityScore: 0.9,
        },
        temporal: {
          daylightViolation: false,
          crossDayRisk: 0,
          arrivalRisk: 0,
        },
        weather: { exposureScore: 0.1 },
        road: { accessibility: 1 },
      },
    ],
    edges: [],
  };
}

describe('execution-stability (P14)', () => {
  it('detects DAG_STRUCTURE_DRIFT when IR.meta.dagId mismatches stable dag hash', () => {
    const dag = minimalDag();
    const ir = compileDAGToIR(dag);
    ir.meta.dagId = 'tampered';
    const signals = detectStabilityDrifts({ dag, ir });
    expect(signals.some(s => s.type === 'DAG_STRUCTURE_DRIFT')).toBe(true);
    expect(evaluateStability(signals).global).toBeLessThan(1);
  });

  it('detects temporal baseline drift on truthHash', () => {
    const dag = minimalDag();
    const ir = compileDAGToIR(dag);
    const _truth = ir.meta.dagId;
    const signals = detectStabilityDrifts({
      dag,
      ir,
      baseline: {
        truthHash: 'different-hash',
        irFingerprint: 'xx',
      },
    });
    expect(signals.some(s => s.description.includes('truthHash'))).toBe(true);
  });

  it('runExecutionStabilityCycle invokes recompileIR when below threshold', () => {
    const dag = minimalDag();
    let ir = compileDAGToIR(dag);
    ir.meta.dagId = 'bad';
    let recompiled = false;
    const result = runExecutionStabilityCycle({
      detection: { dag, ir },
      threshold: 1,
      fixHandlers: {
        recompileIR: () => {
          recompiled = true;
          ir = compileDAGToIR(dag);
        },
      },
    });
    expect(result.score.global).toBeLessThanOrEqual(1);
    expect(recompiled).toBe(true);
  });

  it('exports threshold aligned with spec', () => {
    expect(STABILITY_GLOBAL_THRESHOLD).toBe(0.85);
  });
});
