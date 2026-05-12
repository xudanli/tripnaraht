/**
 * EIOS — Execution Intelligence OS **Self-Evolving Kernel** (UKHFS-backed).
 *
 * ECPSθ + 𝓕_{Kθ}(·,EXEC) vs 𝓕_{Kθ}(·,SHADOW) + SPCL projection discrepancy ε.
 */

import type { ExecutionDecision } from './execution-control-policy.types';
import type { ECPSRuntimeBias } from './policy-correction.types';
import type { CausalFieldSnapshot, CausalInteractionKernel, FieldDynamicsConfig } from './multi-agent-causal-field.types';
import type { SpclErrorBundle, PhiDeltaByAgent, SpclObservationSample } from './shadow-policy-calibration.types';
import type { UkhfExecDynamicsMode } from './ukhf-field.types';

export type EiosWorldDynamicsMode = UkhfExecDynamicsMode;

export const EIOS_KERNEL_TICK_SCHEMA = 'eios/kernel-tick/v1' as const;

/** Mirrors `ncgesObservabilityPreview` payload — kept structural for EIOS observability. */
export interface NcgesObservabilityPayload {
  schema: 'ncges/preview/v1';
  dynamics_mode: string;
  parameter_version?: string;
  phi_before: { agent_id: string; phi: number }[];
  phi_after: { agent_id: string; phi: number }[];
  max_delta_phi: number;
}

/** Minimal θ proxy surface — extend when ECPS becomes full param vector. */
export interface EiosKernelThetaSlice {
  ecpsBias: ECPSRuntimeBias;
}

/** Structure slot — Kθ prior / learned adjacency. */
export interface EiosKernelStructureSlice {
  causalKernel: CausalInteractionKernel;
}

/** One closed-loop observability record — no side effects until caller applies SPCL / persistence. */
export interface EiosKernelTickResult {
  schema: typeof EIOS_KERNEL_TICK_SCHEMA;
  queryId: string;
  decision: ExecutionDecision;
  /** Φ_t */
  phiBefore: CausalFieldSnapshot;
  /** CMAFT / world branch Φ_{t+1} = F_K(Φ_t) (nonlinear or Laplacian per `worldDynamicsMode`). */
  phiAfterCmaft: CausalFieldSnapshot;
  /** NCGES preview payload (shadow dynamics estimator). */
  ncges_preview: NcgesObservabilityPayload;
  deltaPhiShadow: PhiDeltaByAgent;
  /** Execution-side increment — caller fills from telemetry; defaults to zero baseline. */
  deltaPhiExec: PhiDeltaByAgent;
  /** Ready for SPCL / global buffer. */
  spclSample: SpclObservationSample;
  /** ε field. */
  spclError: SpclErrorBundle;
}

export interface EiosKernelTickParams {
  decision: ExecutionDecision;
  queryId: string;
  /** Kθ — shared by CMAFT world step and NCGES linear shadow Φ̂_{t+1}=S(Φ_t,Kθ). */
  causalKernel?: CausalInteractionKernel;
  structureSlice?: EiosKernelStructureSlice;
  /**
   * World dynamics within the same kernel family (linear Laplacian vs message-passing stub).
   * Default `MESSAGE_PASSING_STUB` so ε contrasts nonlinear world vs linear shadow on shared Kθ.
   */
  worldDynamicsMode?: EiosWorldDynamicsMode;
  /**
   * Optional measured ΔΦ from telemetry — overrides the default world increment
   * (φ_after_world − φ_before) used as the execution channel in SPCL.
   */
  deltaPhiExec?: PhiDeltaByAgent;
  /** Optional override for the single field step (defaults match preview / CMAFT). */
  fieldDynamicsConfig?: FieldDynamicsConfig;
}
