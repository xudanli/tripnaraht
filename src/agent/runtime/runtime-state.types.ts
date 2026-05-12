/**
 * P0 — UnifiedRuntimeState: single materialized carrier for one logical execution tick / slice.
 * Wires existing contracts without new semantics — storage and services fill the optional slots.
 */

import type { CausalFieldSnapshot, CausalInteractionKernel } from '../contracts/multi-agent-causal-field.types';
import type { ExecutionCertificate } from '../contracts/pccs-ei.types';
import type { SpclErrorBundle } from '../contracts/shadow-policy-calibration.types';

export const RUNTIME_UNIFIED_STATE_SCHEMA = 'runtime/unified-state/v1' as const;

/** Minimal topology summary when full GPM witness is not embedded (save bytes at edge). */
export interface RuntimeTopologySummary {
  epsilonGeomRms?: number;
  execEnergy?: number;
  shadowEnergy?: number;
}

/**
 * Φ, ε, Kθ, proof, artifacts, topology — one row-shaped view for scheduler / persistence / graph.
 */
export interface UnifiedRuntimeState {
  schema: typeof RUNTIME_UNIFIED_STATE_SCHEMA;
  queryId: string;
  tickId?: string;
  tickTimestampMs?: number;

  /** Φ — causal field snapshot at this tick (nullable before first evolve). */
  phi: CausalFieldSnapshot | null;

  /** ε — SPCL error bundle when dual projection or telemetry exists. */
  epsilon: SpclErrorBundle | null;

  /** Kθ — full kernel when available; else use fingerprint only. */
  causalKernel: CausalInteractionKernel | null;
  kThetaFingerprint: string | null;

  /** PCCS execution certificate when π_proof was materialized for this tick. */
  proofCertificate?: ExecutionCertificate;

  /** Opaque artifact ids (replay blobs, tool outputs, dedup keys). */
  artifactRefs: string[];

  /** Link into materialized execution graph (P1). */
  executionGraphNodeId?: string;

  /** Topology / geometry slice for convergence & replay guards. */
  topologySummary?: RuntimeTopologySummary;
}
