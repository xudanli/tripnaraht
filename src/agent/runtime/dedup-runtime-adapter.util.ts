/**
 * Build P0+P1+P2 observability slice — dedup replay or fresh execution path.
 */

import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import type { NcgesObservabilityPayload } from '../contracts/eios-kernel.types';
import {
  buildPhiSnapshotFromEcpsDecision,
  toyKernelIntensityEntropyCoupling,
} from '../utils/cognitive-execution-pipeline.util';
import { runEiosKernelTick } from '../utils/eios-self-evolving-kernel.util';
import { buildExecutionCertificate, fingerprintCausalKernel } from '../utils/pccs-ei-certificate.util';
import {
  buildExecutionGraphSnapshot,
  type ExecutionGraphPathKind,
} from './execution-graph-builder.util';
import { mergeUnifiedRuntimeState, emptyUnifiedRuntimeState } from './runtime-state.util';
import type { RuntimeObservabilitySlice } from './runtime-observability-slice.types';
import { RUNTIME_OBSERVABILITY_SLICE_SCHEMA } from './runtime-observability-slice.types';
import { planUnifiedSchedulerTick } from './unified-scheduler.plan';

function snapshotFromNcgesPreview(
  preview: Pick<NcgesObservabilityPayload, 'phi_after'>,
  queryId: string,
  timeStep: number,
): CausalFieldSnapshot {
  return {
    queryId,
    timeStep,
    particles: preview.phi_after.map((r) => ({ agentId: r.agent_id, phi: r.phi })),
  };
}

function runtimeMaterializationEnabled(): boolean {
  const v = process.env.RUNTIME_MATERIALIZATION_OBS;
  return v === '1' || v === 'true' || v === 'yes';
}

function fullEiosPccsEnabled(): boolean {
  const v = process.env.RUNTIME_MATERIALIZATION_FULL;
  return v === '1' || v === 'true' || v === 'yes';
}

export interface BuildRuntimeObservabilitySliceInput {
  requestId: string;
  artifactId: string;
  decision: ExecutionDecision;
  replayEligible: boolean;
  /** Default DEDUP_REPLAY — fresh paths use FRESH_EXECUTION. */
  pathKind?: ExecutionGraphPathKind;
}

/**
 * UnifiedRuntimeState + scheduler + execution graph (+ optional full EIOS/PCCS).
 */
export function buildRuntimeObservabilitySlice(
  input: BuildRuntimeObservabilitySliceInput,
): RuntimeObservabilitySlice {
  const pathKind = input.pathKind ?? 'DEDUP_REPLAY';
  const K = toyKernelIntensityEntropyCoupling();
  const fp = fingerprintCausalKernel(K);

  const scheduler_plan = planUnifiedSchedulerTick({
    queryId: input.requestId,
    artifactId: input.artifactId,
    replayEligible: input.replayEligible,
    spclCollapseRequested:
      input.decision.invalidationScope !== 'NONE' || input.decision.mode === 'RECOMPUTE',
    operatorFamilyHint: input.decision.kernel,
    ecpsDecision: input.decision,
  });

  const includeProof = fullEiosPccsEnabled();
  const execution_graph = buildExecutionGraphSnapshot({
    queryId: input.requestId,
    requestId: input.requestId,
    artifactId: input.artifactId,
    kernelTag: input.decision.kernel,
    pathKind,
    includeProofNode: includeProof,
  });

  let unified_state = mergeUnifiedRuntimeState(emptyUnifiedRuntimeState(input.requestId), {
    phi: buildPhiSnapshotFromEcpsDecision(input.decision, input.artifactId),
    epsilon: null,
    causalKernel: K,
    kThetaFingerprint: fp,
    artifactRefs: [input.artifactId],
    executionGraphNodeId: `n:${input.requestId}:routing`,
  });

  if (fullEiosPccsEnabled()) {
    const tick = runEiosKernelTick({ decision: input.decision, queryId: input.artifactId, causalKernel: K });
    const phiShadow = snapshotFromNcgesPreview(tick.ncges_preview, input.artifactId, tick.phiAfterCmaft.timeStep);
    const cert = buildExecutionCertificate({
      phiExec: tick.phiAfterCmaft,
      phiShadow,
      spclSample: tick.spclSample,
      causalKernel: K,
      execMode: 'EXEC',
    });
    unified_state = mergeUnifiedRuntimeState(unified_state, {
      phi: tick.phiAfterCmaft,
      epsilon: tick.spclError,
      proofCertificate: cert,
    });
  }

  return {
    schema: RUNTIME_OBSERVABILITY_SLICE_SCHEMA,
    unified_state,
    scheduler_plan,
    execution_graph,
  };
}

/** Dedup gateway path — alias with fixed graph topology label. */
export function buildDedupRuntimeObservabilitySlice(
  input: Omit<BuildRuntimeObservabilitySliceInput, 'pathKind'>,
): RuntimeObservabilitySlice {
  return buildRuntimeObservabilitySlice({ ...input, pathKind: 'DEDUP_REPLAY' });
}

export function shouldAttachDedupRuntimeObservability(): boolean {
  return runtimeMaterializationEnabled();
}
