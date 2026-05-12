/**
 * Glue ECPS `ExecutionDecision` → discrete Φ snapshots → NCGES dynamics preview (no decision override).
 *
 * Used for observability and future wiring to AgentService; ECPS remains authoritative for routing.
 */

import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { PhiDeltaByAgent, SpclObservationSample } from '../contracts/shadow-policy-calibration.types';
import type {
  CausalFieldSnapshot,
  CausalInteractionKernel,
  FieldDynamicsConfig,
} from '../contracts/multi-agent-causal-field.types';
import type { NeuralCausalGraphBundle } from '../contracts/neural-causal-graph-execution.types';
import {
  applyCausalOperatorField,
  causalOperatorFieldFromKernel,
} from './coft-ei-operator-field.util';

export const DEFAULT_CAUSAL_FIELD_DYNAMICS: FieldDynamicsConfig = {
  dt: 0.15,
  damping: 0.12,
  couplingScale: 1,
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Map semantic features to a 2-node toy graph (intensity ↔ entropy coupling). */
export function buildPhiSnapshotFromEcpsDecision(
  decision: ExecutionDecision,
  queryId: string,
): CausalFieldSnapshot {
  return {
    queryId,
    timeStep: 0,
    particles: [
      { agentId: 'aggregate_intensity', phi: clamp01(decision.features.intensity) },
      { agentId: 'aggregate_entropy', phi: clamp01(decision.features.entropy) },
    ],
  };
}

/** Mild cross-coupling kernel — placeholder until Kθ is learned. */
export function toyKernelIntensityEntropyCoupling(): CausalInteractionKernel {
  return {
    agentOrder: ['aggregate_intensity', 'aggregate_entropy'],
    matrix: [
      [0, 0.35],
      [0.35, 0],
    ],
  };
}

export interface NcgesLinearPreviewResult {
  snapshot0: CausalFieldSnapshot;
  snapshot1: CausalFieldSnapshot;
  bundle: NeuralCausalGraphBundle;
}

/** One SHADOW slice 𝒪_{Kθ}^{shadow}[Φ] — COFT-EI linear projection; uses `causalKernel` (Kθ) when passed. */
export function ncgesLinearPreviewFromExecutionDecision(
  decision: ExecutionDecision,
  queryId: string,
  dynamicsConfig: FieldDynamicsConfig = DEFAULT_CAUSAL_FIELD_DYNAMICS,
  causalKernel: CausalInteractionKernel = toyKernelIntensityEntropyCoupling(),
): NcgesLinearPreviewResult {
  const snapshot0 = buildPhiSnapshotFromEcpsDecision(decision, queryId);
  const snapshot1 = applyCausalOperatorField(
    causalOperatorFieldFromKernel(causalKernel),
    snapshot0,
    'SHADOW',
    dynamicsConfig,
  );
  const bundle: NeuralCausalGraphBundle = {
    kernel: causalKernel,
    dynamicsMode: 'LINEAR_LAPLACIAN',
    parameterVersion: 'ncges-preview/v1',
  };
  return { snapshot0, snapshot1, bundle };
}

/** Compact payload for `observability.ncges_preview` on dedup / debug responses. */
export function ncgesObservabilityPreview(
  decision: ExecutionDecision,
  queryId: string,
  dynamicsConfig: FieldDynamicsConfig = DEFAULT_CAUSAL_FIELD_DYNAMICS,
  causalKernel: CausalInteractionKernel = toyKernelIntensityEntropyCoupling(),
) {
  const { snapshot0, snapshot1, bundle } = ncgesLinearPreviewFromExecutionDecision(
    decision,
    queryId,
    dynamicsConfig,
    causalKernel,
  );
  const phiDelta = snapshot0.particles.map((p0, i) => {
    const p1 = snapshot1.particles[i];
    return p1 ? Math.abs(p1.phi - p0.phi) : 0;
  });
  return {
    schema: 'ncges/preview/v1' as const,
    dynamics_mode: bundle.dynamicsMode,
    parameter_version: bundle.parameterVersion,
    phi_before: snapshot0.particles.map((p) => ({ agent_id: p.agentId, phi: p.phi })),
    phi_after: snapshot1.particles.map((p) => ({ agent_id: p.agentId, phi: p.phi })),
    max_delta_phi: phiDelta.length ? Math.max(...phiDelta) : 0,
  };
}

export function cognitiveNcgesPreviewEnabled(): boolean {
  const v = process.env.COGNITIVE_NCGES_PREVIEW;
  return v === '1' || v === 'true' || v === 'yes';
}

/** ΔΦ_shadow from NCGES preview rows (φ_after − φ_before per agent). */
export function deltaPhiShadowFromNcgesPreview(preview: {
  phi_before: { agent_id: string; phi: number }[];
  phi_after: { agent_id: string; phi: number }[];
}): PhiDeltaByAgent {
  const out: PhiDeltaByAgent = {};
  for (let i = 0; i < preview.phi_before.length; i++) {
    const b = preview.phi_before[i];
    const a = preview.phi_after[i];
    if (b && a && b.agent_id === a.agent_id) {
      out[b.agent_id] = a.phi - b.phi;
    }
  }
  return out;
}

/** Per-agent φ increment between two snapshots (aligned by `before.particles` ids). */
export function snapshotPhiDelta(
  before: CausalFieldSnapshot,
  after: CausalFieldSnapshot,
): PhiDeltaByAgent {
  const afterById = new Map(after.particles.map((p) => [p.agentId, p.phi]));
  const out: PhiDeltaByAgent = {};
  for (const p of before.particles) {
    const phiA = afterById.get(p.agentId);
    out[p.agentId] = (phiA !== undefined ? phiA : p.phi) - p.phi;
  }
  return out;
}

/**
 * SPCL sample when real ΔΦ_exec is unknown — exec deltas zeroed (conservative “no actuator” baseline).
 * Prefer measured exec increments from traces when available.
 */
export function buildSpclSampleShadowOnlyFromEcpsPreview(
  decision: ExecutionDecision,
  queryId: string,
  dynamicsConfig: FieldDynamicsConfig = DEFAULT_CAUSAL_FIELD_DYNAMICS,
  causalKernel: CausalInteractionKernel = toyKernelIntensityEntropyCoupling(),
): SpclObservationSample {
  const preview = ncgesObservabilityPreview(decision, queryId, dynamicsConfig, causalKernel);
  const shadow = deltaPhiShadowFromNcgesPreview(preview);
  const deltaPhiExec: PhiDeltaByAgent = {};
  for (const k of Object.keys(shadow)) deltaPhiExec[k] = 0;
  return { deltaPhiExec, deltaPhiShadow: shadow };
}
