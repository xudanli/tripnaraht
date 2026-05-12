/**
 * Neural Causal Graph Execution System (NCGES) — **learned** causal graph Kθ + graph neural dynamics + control πθ.
 *
 * CMAFT supplies explicit Euler Laplacian diffusion; NCGES replaces it with learnable K and nonlinear GNN evolution,
 * with replay driving system identification on (Kθ, dynamics θ, control θ).
 */

import type { CausalFieldSnapshot, CausalInteractionKernel } from './multi-agent-causal-field.types';

export type NcgesDynamicsMode =
  /** Delegates to discrete Laplacian Euler (CMAFT-compatible baseline). */
  | 'LINEAR_LAPLACIAN'
  /** Toy nonlinear message-passing layer σ(K⊙φ); swap for real GNNθ. */
  | 'MESSAGE_PASSING_STUB';

/** Conditioning bundle for one NCGES forward step. */
export interface NeuralCausalGraphBundle {
  kernel: CausalInteractionKernel;
  dynamicsMode: NcgesDynamicsMode;
  /** Checkpoint / θ hash once learner exists. */
  parameterVersion?: string;
}

/** Φ-history + replay pointers — feeds Kθ = fθ(context) once learner exists. */
export interface LearnedKernelContext {
  phiHistory: CausalFieldSnapshot[];
  replayTraceIds?: string[];
}

/** Goal / task embedding for πθ(Φ, K, goal) → ΔΦ */
export interface NcgesGoalSignal {
  goalVector: number[];
}

/** Replay-driven identification losses (structure / dynamics / control splits land here later). */
export interface NcgesIdentificationLoss {
  /** Scalar ||Φ_obs − Φ_pred||² proxy — kernel + dynamics correction target. */
  fieldResidual: number;
  /** Optional ECPS control mismatch — extend when πθ is fitted. */
  controlResidual?: number;
}
