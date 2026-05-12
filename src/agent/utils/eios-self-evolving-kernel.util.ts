/**
 * EIOS Self-Evolving Kernel — COFT-EI: 𝒪_{Kθ}^{exec} vs 𝒪_{Kθ}^{shadow}, ε as operator projection mismatch.
 *
 * Default ε channel: ΔΦ_exec − ΔΦ_shadow with ΔΦ_exec from EXEC slice (telemetry optional override).
 *
 * Side-effect free: callers push `spclSample` to `GlobalSpclRingBuffer` or `EcpsRuntimeBiasService` as needed.
 */

import type { FieldDynamicsConfig } from '../contracts/multi-agent-causal-field.types';
import {
  EIOS_KERNEL_TICK_SCHEMA,
  type EiosKernelTickParams,
  type EiosKernelTickResult,
  type NcgesObservabilityPayload,
} from '../contracts/eios-kernel.types';
import type { PhiDeltaByAgent } from '../contracts/shadow-policy-calibration.types';
import {
  buildPhiSnapshotFromEcpsDecision,
  DEFAULT_CAUSAL_FIELD_DYNAMICS,
  deltaPhiShadowFromNcgesPreview,
  ncgesObservabilityPreview,
  snapshotPhiDelta,
  toyKernelIntensityEntropyCoupling,
} from './cognitive-execution-pipeline.util';
import {
  applyCausalOperatorField,
  causalOperatorFieldFromKernel,
} from './coft-ei-operator-field.util';
import { computeSpclError } from './shadow-policy-calibration.util';

function resolveCausalKernel(params: EiosKernelTickParams) {
  return params.structureSlice?.causalKernel ?? params.causalKernel ?? toyKernelIntensityEntropyCoupling();
}

function mergeExecDelta(
  shadowKeys: PhiDeltaByAgent,
  explicit?: PhiDeltaByAgent,
): PhiDeltaByAgent {
  if (!explicit) {
    const out: PhiDeltaByAgent = {};
    for (const k of Object.keys(shadowKeys)) out[k] = 0;
    return out;
  }
  const out: PhiDeltaByAgent = {};
  for (const k of Object.keys(shadowKeys)) out[k] = 0;
  for (const k of Object.keys(explicit)) {
    out[k] = explicit[k]!;
  }
  return out;
}

/**
 * One EIOS tick: shared 𝒪_{Kθ}; EXEC slice via `worldDynamicsMode`; SHADOW slice = linear inference projection.
 */
export function runEiosKernelTick(
  params: EiosKernelTickParams,
  cmaftConfig?: FieldDynamicsConfig,
): EiosKernelTickResult {
  const config = params.fieldDynamicsConfig ?? cmaftConfig ?? DEFAULT_CAUSAL_FIELD_DYNAMICS;
  const { decision, queryId } = params;
  const K = resolveCausalKernel(params);
  const worldMode = params.worldDynamicsMode ?? 'MESSAGE_PASSING_STUB';

  const phiBefore = buildPhiSnapshotFromEcpsDecision(decision, queryId);
  const field = causalOperatorFieldFromKernel(K);

  const phiAfterCmaft = applyCausalOperatorField(field, phiBefore, 'EXEC', config, {
    execDynamics: worldMode,
  });

  const preview = ncgesObservabilityPreview(decision, queryId, config, K) as NcgesObservabilityPayload;

  const deltaPhiShadow = deltaPhiShadowFromNcgesPreview(preview);
  const deltaPhiWorld = snapshotPhiDelta(phiBefore, phiAfterCmaft);
  const deltaPhiExec = params.deltaPhiExec
    ? mergeExecDelta(deltaPhiShadow, params.deltaPhiExec)
    : deltaPhiWorld;

  const spclSample = {
    deltaPhiExec,
    deltaPhiShadow,
  };

  return {
    schema: EIOS_KERNEL_TICK_SCHEMA,
    queryId,
    decision,
    phiBefore,
    phiAfterCmaft,
    ncges_preview: preview,
    deltaPhiShadow,
    deltaPhiExec,
    spclSample,
    spclError: computeSpclError(spclSample),
  };
}
