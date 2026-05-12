/**
 * NCGES runtime stubs — wire learned Kθ + GNNθ + πθ when trainers exist.
 *
 * Today: Kθ ← contextual stub; dynamics ← Laplacian OR nonlinear MP stub; πθ ← goal-aligned δΦ stub.
 */

import type {
  CausalFieldSnapshot,
  CausalInteractionKernel,
  FieldDynamicsConfig,
} from '../contracts/multi-agent-causal-field.types';
import type {
  LearnedKernelContext,
  NcgesGoalSignal,
  NcgesIdentificationLoss,
  NeuralCausalGraphBundle,
} from '../contracts/neural-causal-graph-execution.types';
import {
  evolveCausalFieldOneStep,
  fieldReconstructionResidual,
  phiVector,
  snapshotFromVector,
} from './multi-agent-causal-field.util';

function tanh(x: number): number {
  return Math.tanh(x);
}

/** Kθ stub — returns prior until neural causal graph net is trained. */
export function learnKernelFromContextStub(
  ctx: LearnedKernelContext,
  priorKernel: CausalInteractionKernel,
): CausalInteractionKernel {
  void ctx;
  return priorKernel;
}

/**
 * Graph neural evolution stub:
 * - LINEAR_LAPLACIAN → same as CMAFT Euler step.
 * - MESSAGE_PASSING_STUB → Φ'_i = tanh( γ Σ_j K_ij φ_j ) with residual blend toward φ (stability).
 */
export function gnnDynamicsStep(
  snapshot: CausalFieldSnapshot,
  bundle: NeuralCausalGraphBundle,
  config: FieldDynamicsConfig,
  mpStub?: { gamma?: number; residualMix?: number },
): CausalFieldSnapshot {
  if (bundle.dynamicsMode === 'LINEAR_LAPLACIAN') {
    return evolveCausalFieldOneStep(snapshot, bundle.kernel, config);
  }

  const { agentOrder: order, matrix: K } = bundle.kernel;
  const n = order.length;
  if (K.length !== n || !K.every((row) => row.length === n)) {
    throw new Error('NCGES_KERNEL_SHAPE_MISMATCH');
  }

  const gamma = mpStub?.gamma ?? 1;
  const mix = mpStub?.residualMix ?? 0.65;
  const phi = phiVector(snapshot, order);
  const agg = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += K[i][j] * phi[j];
    agg[i] = tanh(gamma * s);
  }

  const next = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    next[i] = mix * phi[i] + (1 - mix) * agg[i];
  }

  return snapshotFromVector(snapshot.queryId, snapshot.timeStep + 1, order, next);
}

/** πθ stub: maps goal embedding → sparse δΦ on agents (scale-only toy policy). */
export function ncgesControlDeltaStub(
  snapshot: CausalFieldSnapshot,
  kernel: CausalInteractionKernel,
  goal: NcgesGoalSignal,
): Record<string, number> {
  const scale = goal.goalVector.length ? Math.tanh(goal.goalVector[0]!) * 0.15 : 0;
  const out: Record<string, number> = {};
  for (const id of kernel.agentOrder) {
    out[id] = scale;
  }
  return out;
}

/** Single closed-loop step: dynamics then optional ECPS control injection (caller merges δΦ via applyFieldPerturbation). */
export function ncgesForwardStep(params: {
  snapshot: CausalFieldSnapshot;
  bundle: NeuralCausalGraphBundle;
  dynamicsConfig: FieldDynamicsConfig;
  goal?: NcgesGoalSignal;
  mpStub?: { gamma?: number; residualMix?: number };
  applyControl?: boolean;
}): CausalFieldSnapshot {
  let next = gnnDynamicsStep(
    params.snapshot,
    params.bundle,
    params.dynamicsConfig,
    params.mpStub,
  );
  if (params.applyControl && params.goal) {
    const delta = ncgesControlDeltaStub(params.snapshot, params.bundle.kernel, params.goal);
    next = {
      ...next,
      particles: next.particles.map((p) => ({
        ...p,
        phi: p.phi + (delta[p.agentId] ?? 0),
      })),
    };
  }
  return next;
}

/** Replay loss — structure + dynamics correction target (control slot optional). */
export function ncgesReplayIdentificationLoss(
  predicted: CausalFieldSnapshot,
  observed: CausalFieldSnapshot,
): NcgesIdentificationLoss {
  const fr = fieldReconstructionResidual(predicted, observed);
  return {
    fieldResidual: fr.residualL2 * fr.residualL2,
  };
}
