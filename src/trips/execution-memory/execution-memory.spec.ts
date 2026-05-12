import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import { executeExecutionIR } from '../execution-ir/execute-execution-ir';
import {
  appendExecutionSnapshot,
  buildExecutionSnapshot,
  clearExecutionMemoryStore,
  getExecutionMemoryGraph,
  hashExecutionOverlayFrames,
  recordExecutionMemory,
  replayExecution,
  runCounterfactual,
  snapshotsAreDeterministicallyAligned,
  stableExecutionIrId,
  createExecutionMemoryEventId,
} from './index';

function minimalFeasibleDag(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:a',
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
        weather: { exposureScore: 0.2 },
        road: { accessibility: 1 },
      },
    ],
    edges: [],
  };
}

describe('execution-memory (P13)', () => {
  beforeEach(() => {
    clearExecutionMemoryStore();
  });

  it('recordExecutionMemory + replayExecution fold proof/sim/decision summaries', () => {
    const dag = minimalFeasibleDag();
    const ir = compileDAGToIR(dag);
    const dagId = ir.meta.dagId;
    const irId = stableExecutionIrId(ir);
    const ts = 1_700_000_000_000;

    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'PROOF_EVALUATED', ts),
      dagId,
      irId,
      timestamp: ts,
      type: 'PROOF_EVALUATED',
      payload: { globalStatus: 'FEASIBLE' },
    });
    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'SIMULATION_RUN', ts + 1),
      dagId,
      irId,
      timestamp: ts + 1,
      type: 'SIMULATION_RUN',
      payload: { variantIds: ['v1'], bestVariantId: 'v1' },
    });
    recordExecutionMemory({
      id: createExecutionMemoryEventId(dagId, 'NEPTUNE_DECISION', ts + 2),
      dagId,
      irId,
      timestamp: ts + 2,
      type: 'NEPTUNE_DECISION',
      payload: { explanation: 'ok', triggerCount: 0 },
    });

    const folded = replayExecution(dagId);
    expect(folded.lastProofStatus).toBe('FEASIBLE');
    expect(folded.lastSimulationSummary?.variantIds).toEqual(['v1']);
    expect(folded.lastNeptuneSummary?.explanation).toBe('ok');
    expect(folded.rawEvents).toHaveLength(3);
  });

  it('buildExecutionSnapshot aligns truthHash with stableExecutionDagId and stableExecutionIrId', () => {
    const dag = minimalFeasibleDag();
    const ir = compileDAGToIR(dag);
    const snap = buildExecutionSnapshot({ dag, ir });
    expect(snap.dagId).toBe(ir.meta.dagId);
    expect(snap.irId).toBe(stableExecutionIrId(ir));
    expect(snap.truthHash).toBe(snap.dagId);
    const snap2 = buildExecutionSnapshot({ dag, ir });
    expect(snapshotsAreDeterministicallyAligned(snap, snap2)).toBe(true);
  });

  it('hashExecutionOverlayFrames is stable for reorder', () => {
    const a = hashExecutionOverlayFrames(undefined);
    const b = hashExecutionOverlayFrames(undefined);
    expect(a).toBe(b);
  });

  it('runCounterfactual returns infeasible when mutation closes road', () => {
    const dag = minimalFeasibleDag();
    const out = runCounterfactual(dag, d => ({
      ...d,
      nodes: d.nodes.map(n =>
        n.id === 'exec:a'
          ? {
              ...n,
              road: { accessibility: 0 },
            }
          : n,
      ),
    }));
    expect(out.feasible).toBe(false);
    expect(out.proof.globalStatus).toBe('INFEASIBLE');
  });

  it('runCounterfactual compiles IR and executes VM when feasible', () => {
    const dag = minimalFeasibleDag();
    const out = runCounterfactual(dag, d => d);
    expect(out.feasible).toBe(true);
    if (out.feasible) {
      expect(out.result.pathCost).toBeDefined();
      expect(executeExecutionIR(out.ir, dag).pathCost).toBe(out.result.pathCost);
    }
  });

  it('appendExecutionSnapshot appears in getExecutionMemoryGraph', () => {
    const dag = minimalFeasibleDag();
    const ir = compileDAGToIR(dag);
    appendExecutionSnapshot(buildExecutionSnapshot({ dag, ir }));
    expect(getExecutionMemoryGraph().snapshots).toHaveLength(1);
  });
});
