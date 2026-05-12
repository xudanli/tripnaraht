/**
 * Discrete Causal Field Engine — **graph diffusion / consensus dynamics** on agent latent scalars φᵢ.
 *
 * Not continuum field theory: Φ_t is a vector on the agent graph, K is a weighted influence adjacency,
 * dynamics are Laplacian flow Φ_{t+1} ≈ (I − αL_K − βI)Φ + δΦ with ECPS as **control injection δΦ**.
 * Replay targets **system identification**: infer K (and δΦ statistics) from observed Φ trajectories.
 */

/** One agent as a causal potential source at discrete (t) — spatial coordinates optional extension. */
export interface AgentFieldParticle {
  agentId: string;
  /** Scalar field amplitude — φᵢ(t) in the abstract lattice. */
  phi: number;
}

/** Global field state Φ_t = {φ₁…φₙ}. */
export interface CausalFieldSnapshot {
  queryId: string;
  /** Discrete time / rollout index. */
  timeStep: number;
  particles: AgentFieldParticle[];
}

/**
 * Row index = target agent, column = source: influence **from j onto i** is K[i][j].
 * Align rows/cols with `agentOrder`.
 */
export interface CausalInteractionKernel {
  agentOrder: string[];
  /** size n×n */
  matrix: number[][];
  /** Optional per-edge semantics for calibration / replay. */
  edgeHints?: {
    delaySteps?: number[][];
    amplification?: number[][];
    damping?: number[][];
  };
}

/**
 * Discrete dynamics: Φ_{t+1} = Φ_t − α L_K Φ_t − β Φ_t (+ δΦ optional via `applyFieldPerturbation`),
 * α = dt·couplingScale, β = dt·damping, L_K = diag(rowSum(K)) − K (directed weighted Laplacian).
 */
export interface FieldDynamicsConfig {
  dt: number;
  /** Maps to β = dt · damping in (I − αL_K − βI). */
  damping: number;
  /** Maps to α = dt · couplingScale as coefficient on L_K Φ. */
  couplingScale: number;
}

/** Placeholder for learned K[i][j] — graph neural / causal discovery hooks. */
export interface LearningKernelFitConstraints {
  maxEdgeWeight?: number;
  sparsityPrior?: number;
}

export interface LearningKernelFitResult {
  kernel: CausalInteractionKernel;
  loss: number;
  converged: boolean;
}

/** Replay as **field reconstruction**: compare predicted vs observed Φ. */
export interface FieldReconstructionReport {
  queryId: string;
  /** L²-type residual across aligned agents. */
  residualL2: number;
  /** Optional diagnosis for kernel calibration. */
  diagnosis?: 'KERNEL_MISFIT' | 'BROKEN_CAUSAL_CHAIN' | 'ALIGNED';
}
