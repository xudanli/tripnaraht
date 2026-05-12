/**
 * P-Next 8 — Evaluate each branch’s physics index under the semantic DSL (same engine as P-Next 6).
 */

import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { ExecutionSemanticsSpec } from '../execution-semantics/execution-semantics-spec.types';
import { DEFAULT_EXECUTION_SEMANTICS_V1 } from '../execution-semantics/default-execution-semantics-v1';
import { evaluateExecutionSemantics } from '../execution-semantics/evaluate-execution-semantics';
import { buildPhysicsFieldIndex } from '../physics/build-physics-field-index';
import type { CounterfactualBranch } from './physics-branch.types';
import { applyCounterfactualDelta } from './merge-branch-physics';

export interface BranchEvaluation {
  branchId: string;
  semanticAggregateDistance: number;
  /** 1 − semantic distance (higher is better). */
  stabilityScore: number;
  /** Filled after {@link attachRegretToEvaluations}. */
  regretScore: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Materialize a full index by applying the branch patch to every leg row. */
export function buildPhysicsIndexForBranch(
  baseIndex: PhysicsFieldIndex,
  branch: CounterfactualBranch,
): PhysicsFieldIndex {
  const rows = Object.values(baseIndex.byLegId).map(row =>
    applyCounterfactualDelta(row, branch.modifiedPhysics),
  );
  return buildPhysicsFieldIndex(rows);
}

export function evaluateCounterfactualBranches(
  baseIndex: PhysicsFieldIndex,
  branches: CounterfactualBranch[],
  spec: ExecutionSemanticsSpec = DEFAULT_EXECUTION_SEMANTICS_V1,
): BranchEvaluation[] {
  return branches.map(branch => {
    const idx = buildPhysicsIndexForBranch(baseIndex, branch);
    const sem = evaluateExecutionSemantics(spec, { physicsFieldIndex: idx });
    const dist = sem.semanticAggregateDistance;
    return {
      branchId: branch.branchId,
      semanticAggregateDistance: dist,
      stabilityScore: clamp01(1 - dist),
      regretScore: 0,
    };
  });
}

/** Baseline world (no perturbation). */
export function evaluateBaselineBranch(
  baseIndex: PhysicsFieldIndex,
  baseBranchId: string,
  spec: ExecutionSemanticsSpec = DEFAULT_EXECUTION_SEMANTICS_V1,
): BranchEvaluation {
  const sem = evaluateExecutionSemantics(spec, { physicsFieldIndex: baseIndex });
  const dist = sem.semanticAggregateDistance;
  return {
    branchId: baseBranchId,
    semanticAggregateDistance: dist,
    stabilityScore: clamp01(1 - dist),
    regretScore: 0,
  };
}

export function attachRegretToEvaluations(evals: BranchEvaluation[]): BranchEvaluation[] {
  const dists = evals.map(e => e.semanticAggregateDistance);
  const regrets = dists.map(d => Math.max(0, d - Math.min(...dists)));
  return evals.map((e, i) => ({ ...e, regretScore: regrets[i]! }));
}
