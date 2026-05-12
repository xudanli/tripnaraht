/**
 * Forward simulation: DAG → ordered snapshots (replay / forecast / audit).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type {
  BuildExecutionRuntimeInput,
  ExecutionSnapshot,
} from './execution-runtime.types';
import { deriveExecutionWorldState } from './derive-world-state';

/** Deterministic timeline order for rollout / replay (date → node id). */
export function orderedTraversalIds(dag: ExecutionTruthDAG): string[] {
  return [...dag.nodes]
    .sort((a, b) => {
      const dc = a.date.localeCompare(b.date);
      if (dc !== 0) {
        return dc;
      }
      return a.id.localeCompare(b.id);
    })
    .map(n => n.id);
}

/**
 * Builds a replayable snapshot tape: step 0 = no activation, then one snapshot per activated node.
 */
export function buildExecutionRuntime(input: BuildExecutionRuntimeInput): ExecutionSnapshot[] {
  const { dag } = input;
  const order =
    input.nodeOrder?.filter(id => dag.nodes.some(n => n.id === id)) ?? orderedTraversalIds(dag);

  const snapshots: ExecutionSnapshot[] = [];
  const stamp = () => new Date().toISOString();

  snapshots.push({
    timestamp: stamp(),
    stepIndex: 0,
    dag,
    state: deriveExecutionWorldState(dag, new Set()),
  });

  const active = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    active.add(order[i]!);
    snapshots.push({
      timestamp: stamp(),
      stepIndex: i + 1,
      dag,
      state: deriveExecutionWorldState(dag, active),
    });
  }

  return snapshots;
}

/** Roll back to previous snapshot (replay index). */
export function rollbackSnapshot(snapshots: ExecutionSnapshot[], stepIndex: number): ExecutionSnapshot {
  const i = Math.max(0, Math.min(stepIndex, snapshots.length - 1));
  const prev = Math.max(0, i - 1);
  return snapshots[prev]!;
}
