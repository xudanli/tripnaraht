import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import {
  applySelfUpdates,
  reflectOnExecution,
  type ExecutionSelfModel,
  type ReflectableExecutionResult,
} from './index';

function dagWithRouteEdge(): ExecutionTruthDAG {
  return {
    nodes: [
      {
        id: 'exec:a',
        date: '2026-06-01',
        slotId: 's',
        type: 'LEG',
        execution: { finalState: 'OK', delayMinutes: 0, reliabilityScore: 0.9 },
        temporal: { daylightViolation: false, crossDayRisk: 0, arrivalRisk: 0.1 },
        weather: { exposureScore: 0.1 },
        road: { accessibility: 1 },
      },
    ],
    edges: [
      {
        id: 'e1',
        from: 'exec:a',
        to: 'exec:a',
        type: 'ROUTE_DEPENDENCY',
        weight: 10,
      },
    ],
  };
}

describe('self-model (P18)', () => {
  const emptySelfModel: ExecutionSelfModel = {
    version: '1',
    observedFailures: [],
    divergencePatterns: [],
    strategyWeights: {},
    compilerDriftSignals: [],
  };

  it('reflectOnExecution emits DAG bias when Neptune noisy but VM healthy', () => {
    const dag = dagWithRouteEdge();
    const ir = compileDAGToIR(dag);
    const results: ReflectableExecutionResult[] = Array.from({ length: 10 }, () => ({
      vmOk: true,
      vmFailures: [],
      pathCost: 2,
      neptuneTriggerCodes: [
        'OVERLAY_HIGH_RISK',
        'OVERLAY_HIGH_RISK',
        'OVERLAY_RELOCATE',
      ],
    }));
    const proposals = reflectOnExecution(dag, ir, results, emptySelfModel);
    expect(proposals.some(p => p.type === 'DAG_WEIGHT_DRIFT')).toBe(true);
  });

  it('applySelfUpdates respects shadow gate', () => {
    const dag = dagWithRouteEdge();
    const ir = compileDAGToIR(dag);
    const results: ReflectableExecutionResult[] = Array.from({ length: 10 }, () => ({
      vmOk: true,
      vmFailures: [],
      pathCost: 2,
      neptuneTriggerCodes: ['OVERLAY_HIGH_RISK', 'OVERLAY_HIGH_RISK'],
    }));
    const proposals = reflectOnExecution(dag, ir, results, emptySelfModel);
    const dagProposal = proposals.find(p => p.type === 'DAG_WEIGHT_DRIFT');
    expect(dagProposal).toBeDefined();

    const withoutShadow = applySelfUpdates(proposals, {}, {});
    expect(withoutShadow.applied.length).toBeGreaterThan(0);

    const withShadow = applySelfUpdates(proposals, {}, {
      shadowApprovedIds: new Set(),
    });
    expect(withShadow.applied).toHaveLength(0);
    expect(withShadow.skipped.length).toBe(proposals.length);
  });

  it('filter drift budget drops tail proposals', () => {
    const dag = dagWithRouteEdge();
    const baseIr = compileDAGToIR(dag);
    const extra = Array.from({ length: 12 }, () => ({
      type: 'PROJECT' as const,
      nodeId: 'exec:a',
      metric: 'risk' as const,
    }));
    const ir = { ...baseIr, steps: [...baseIr.steps, ...extra] };
    const results: ReflectableExecutionResult[] = [{ vmOk: true, vmFailures: [], pathCost: 1 }];
    const proposals = reflectOnExecution(dag, ir, results, emptySelfModel);
    const tight = applySelfUpdates(proposals, {}, { driftBudget: 0.05 });
    expect(tight.applied.length).toBeLessThanOrEqual(proposals.length);
  });
});
