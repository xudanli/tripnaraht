/**
 * P6 Neptune as graph executor facade — traverse / simulate / counterfactual projection.
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionGraphPatch } from '../execution-truth-dag/build-graph-patches';
import { applyGraphPatchesToDag } from './apply-graph-patches';
import { buildExecutionRuntime, orderedTraversalIds } from './build-execution-runtime';
import type { BuildExecutionRuntimeInput, ExecutionSnapshot } from './execution-runtime.types';

export const NeptuneKernel = {
  /** Ordered node ids for deterministic traversal (timeline-ish). */
  traverse(dag: ExecutionTruthDAG): string[] {
    return orderedTraversalIds(dag);
  },

  /** Forward rollout → snapshot tape. */
  simulate(input: BuildExecutionRuntimeInput): ExecutionSnapshot[] {
    return buildExecutionRuntime(input);
  },

  /** Counterfactual: apply patches, re-run kernel on mutated DAG. */
  projectCounterfactual(
    dag: ExecutionTruthDAG,
    patches: ExecutionGraphPatch[],
    nodeOrder?: string[],
  ): ExecutionSnapshot[] {
    const mutated = applyGraphPatchesToDag(dag, patches);
    return buildExecutionRuntime({
      dag: mutated,
      nodeOrder,
    });
  },
};
