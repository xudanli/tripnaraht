/**
 * Rewrites physics-level causality / constraint mode from observation history + compiler posture.
 */

import type { ExecutionCompilerAST } from '../compiler-ast/execution-compiler-ast.types';
import type { CompilerExecutionHistoryEntry } from '../compiler-ast/compiler-execution-history.types';
import type {
  CausalitySemantics,
  ExecutionPhysicsModel,
  PhysicsConstraints,
} from './execution-physics.types';
import type { PhysicsObservationHistory } from './physics-history.types';

export interface CausalityInferenceMetrics {
  conflictsWithRealityRate: number;
  branchExplosionDetected: boolean;
}

export function inferCausalityBias(history: PhysicsObservationHistory): CausalityInferenceMetrics {
  const e = history.entries;
  if (!e.length) {
    return { conflictsWithRealityRate: 0, branchExplosionDetected: false };
  }

  const conflicts = e.filter(x => x.causalConflict).length / e.length;
  const maxBranches = Math.max(0, ...e.map(x => x.branchCount ?? 0));
  const branchExplosionDetected = maxBranches >= 6 || e.filter(x => (x.branchCount ?? 0) > 3).length / e.length > 0.35;

  return {
    conflictsWithRealityRate: conflicts,
    branchExplosionDetected,
  };
}

function defaultPhysicsModel(version: string): ExecutionPhysicsModel {
  return {
    version,
    timeModel: {
      type: 'LINEAR_TIME',
      driftBehavior: 'ACCUMULATIVE',
    },
    causalityModel: 'DAG_CAUSALITY',
    stateTransitionModel: { defaultCollapse: 'EAGER' },
    constraints: 'STRICT_SEQUENTIAL',
  };
}

export function rewriteCausalityModel(
  history: PhysicsObservationHistory,
  _compilerBehavior: ExecutionCompilerAST,
  executionResults: CompilerExecutionHistoryEntry[],
): ExecutionPhysicsModel {
  const metrics = inferCausalityBias(history);

  const vmOkRate =
    executionResults.length > 0
      ? executionResults.filter(r => r.vmOk).length / executionResults.length
      : 1;

  let causalityModel: CausalitySemantics = 'DAG_CAUSALITY';
  if (metrics.conflictsWithRealityRate > 0.2) {
    causalityModel = 'PROBABILISTIC_CAUSALITY';
  }

  let constraints: PhysicsConstraints = 'STRICT_SEQUENTIAL';
  if (metrics.branchExplosionDetected) {
    constraints = 'PARTIAL_ORDER';
  } else if (causalityModel === 'PROBABILISTIC_CAUSALITY') {
    constraints = 'PROBABILISTIC_CAUSALITY';
  }

  const model = defaultPhysicsModel('20');
  model.causalityModel = causalityModel;
  model.constraints = constraints;

  if (vmOkRate < 0.75) {
    model.timeModel = {
      type: 'CAUSAL_TIME',
      driftBehavior: 'CONTEXTUAL_REBASE',
    };
  }

  return model;
}
