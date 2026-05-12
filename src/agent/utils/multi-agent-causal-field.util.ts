/**
 * Discrete causal field engine — graph Laplacian diffusion with ECPS as δΦ control.
 *
 * Mathematical identification: coupled consensus / diffusion on a weighted digraph,
 * Φ_{t+1} ≈ (I − αL_K − βI) Φ_t after perturbations, not continuous PDE field theory.
 */

import type {
  AgentFieldParticle,
  CausalFieldSnapshot,
  CausalInteractionKernel,
  FieldDynamicsConfig,
  FieldReconstructionReport,
  LearningKernelFitConstraints,
  LearningKernelFitResult,
} from '../contracts/multi-agent-causal-field.types';

function indexMap(order: string[]): Map<string, number> {
  const m = new Map<string, number>();
  order.forEach((id, i) => m.set(id, i));
  return m;
}

/** World-level aggregate W ≈ Σᵢ φᵢ — additive superposition (scalar toy layer). */
export function aggregateFieldPotential(snapshot: CausalFieldSnapshot): number {
  let s = 0;
  for (const p of snapshot.particles) s += p.phi;
  return s;
}

export function phiVector(snapshot: CausalFieldSnapshot, order: string[]): Float64Array {
  const idx = indexMap(order);
  const v = new Float64Array(order.length);
  for (const p of snapshot.particles) {
    const i = idx.get(p.agentId);
    if (i !== undefined) v[i] = p.phi;
  }
  return v;
}

export function snapshotFromVector(
  queryId: string,
  timeStep: number,
  order: string[],
  v: Float64Array,
): CausalFieldSnapshot {
  const particles: AgentFieldParticle[] = order.map((agentId, i) => ({
    agentId,
    phi: v[i],
  }));
  return { queryId, timeStep, particles };
}

function matVec(A: number[][], x: Float64Array): Float64Array {
  const n = A.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < A[i].length; j++) s += A[i][j] * x[j];
    y[i] = s;
  }
  return y;
}

/**
 * Directed weighted graph Laplacian: L_K = D_row − K, D_ii = Σⱼ Kᵢⱼ.
 * Then (L_K Φ)_i = Σⱼ Kᵢⱼ(Φᵢ − Φⱼ), and −(L_K Φ)_i = Σⱼ Kᵢⱼ(Φⱼ − Φᵢ).
 */
export function laplacianFromInfluenceMatrix(K: number[][]): number[][] {
  const n = K.length;
  const L: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n).fill(0);
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += K[i][j];
    row[i] = rowSum;
    for (let j = 0; j < n; j++) {
      if (i !== j) row[j] = -K[i][j];
    }
    L[i] = row;
  }
  return L;
}

/**
 * One Euler step: Φ_{t+1} = Φ_t − dt · couplingScale · (L_K Φ_t) − dt · damping · Φ_t
 * ≡ (I − αL_K − βI) Φ with α = dt·couplingScale, β = dt·damping.
 */
export function evolveCausalFieldOneStep(
  snapshot: CausalFieldSnapshot,
  kernel: CausalInteractionKernel,
  config: FieldDynamicsConfig,
): CausalFieldSnapshot {
  const { agentOrder: order, matrix: K } = kernel;
  const n = order.length;
  if (K.length !== n || !K.every((row) => row.length === n)) {
    throw new Error('CMAFT_KERNEL_SHAPE_MISMATCH');
  }

  const phi = phiVector(snapshot, order);
  const L = laplacianFromInfluenceMatrix(K);
  const Lphi = matVec(L, phi);

  const next = new Float64Array(n);
  const alpha = config.dt * config.couplingScale;
  const beta = config.dt * config.damping;
  for (let i = 0; i < n; i++) {
    next[i] = phi[i] - alpha * Lphi[i] - beta * phi[i];
  }

  return snapshotFromVector(snapshot.queryId, snapshot.timeStep + 1, order, next);
}

/** ECPS / policy as control injection δΦ before or between diffusion steps. */
export function applyFieldPerturbation(
  snapshot: CausalFieldSnapshot,
  deltaPhiByAgent: Record<string, number>,
): CausalFieldSnapshot {
  return {
    ...snapshot,
    particles: snapshot.particles.map((p) => ({
      ...p,
      phi: p.phi + (deltaPhiByAgent[p.agentId] ?? 0),
    })),
  };
}

/** Replay → inverse dynamics objective: fit K and δΦ from Φ_obs vs Φ_sim (loss stub elsewhere). */
export function fieldReconstructionResidual(
  predicted: CausalFieldSnapshot,
  observed: CausalFieldSnapshot,
): FieldReconstructionReport {
  const idx = indexMap(observed.particles.map((p) => p.agentId));
  let sumSq = 0;
  let n = 0;
  for (const po of predicted.particles) {
    const j = idx.get(po.agentId);
    if (j === undefined) continue;
    const obs = observed.particles[j];
    if (!obs || obs.agentId !== po.agentId) continue;
    const d = po.phi - obs.phi;
    sumSq += d * d;
    n += 1;
  }

  const residualL2 = n > 0 ? Math.sqrt(sumSq / n) : sumSq;

  let diagnosis: FieldReconstructionReport['diagnosis'] = 'ALIGNED';
  if (residualL2 > 0.5) diagnosis = 'KERNEL_MISFIT';
  else if (residualL2 > 0.15) diagnosis = 'BROKEN_CAUSAL_CHAIN';

  return {
    queryId: predicted.queryId,
    residualL2,
    diagnosis,
  };
}

/** Alias — replay as system identification residual ||Φ_obs − Φ_sim||. */
export const systemIdentificationResidual = fieldReconstructionResidual;

/**
 * Learning Kernel CMAFT placeholder — returns prior until graph learner supplies K̂.
 * Next step: regress K from {(Φ_t, Φ_{t+1})} sequences under sparsity / capacity priors.
 */
export function learningKernelFitStub(params: {
  priorKernel: CausalInteractionKernel;
  constraints?: LearningKernelFitConstraints;
}): LearningKernelFitResult {
  void params.constraints;
  return {
    kernel: params.priorKernel,
    loss: 0,
    converged: true,
  };
}
