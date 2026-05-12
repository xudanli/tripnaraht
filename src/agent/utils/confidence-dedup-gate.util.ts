import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { ReplayEligibilityClass } from '../contracts/replay-artifact-kinds.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';
import { computeArtifactReplayConfidence } from './artifact-replay-confidence.builder';
import { buildExecutionControlContext } from './execution-control-context.builder';
import type { ECPSRuntimeBias } from '../contracts/policy-correction.types';
import { decideExecution } from './ecps.decide-execution';

/**
 * Re-score replay confidence at dedup read time (decay moves forward with `now`).
 */
export function computeConfidenceAtDedupReadTime(
  cached: RouteAndRunResponseDto,
  nowMs: number = Date.now(),
) {
  const obs = cached.observability as {
    replay_cache_provenance?: ReplayProvenance;
    replay_artifact_descriptor?: { replayEligibility: ReplayEligibilityClass };
    runtime_execution_anomalies?: RuntimeExecutionAnomaly[];
  };
  const prov = obs.replay_cache_provenance;
  if (!prov) return undefined;

  const eligibility = obs.replay_artifact_descriptor?.replayEligibility ?? 'FULL';
  return computeArtifactReplayConfidence({
    replayEligibility: eligibility,
    provenance: prov,
    runtimeExecutionAnomalies: obs.runtime_execution_anomalies,
    nowMs,
  });
}

export type DedupConfidenceGateOutcome =
  | { action: 'SERVE_DEDUP' }
  | { action: 'BYPASS_DEDUP_FORCE_FRESH'; reason: string };

function allowMediumDedupFromEnv(): boolean {
  const v = process.env.CONFIDENCE_ALLOW_MEDIUM_DEDUP;
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * L3-style gate: ECPS `ExecutionDecision` — only `mode===REUSE && reuseArtifact` serves dedup.
 */
export function evaluateDedupConfidenceGate(
  cached: RouteAndRunResponseDto,
  request: RouteAndRunRequestDto,
  options?: { allowMediumDedupReplay?: boolean; bias?: ECPSRuntimeBias },
  nowMs?: number,
): DedupConfidenceGateOutcome {
  const gateOff = process.env.CONFIDENCE_DEDUP_GATE_DISABLED;
  if (gateOff === '1' || gateOff === 'true' || gateOff === 'yes') {
    return { action: 'SERVE_DEDUP' };
  }

  const allowMedium = options?.allowMediumDedupReplay ?? allowMediumDedupFromEnv();

  const ctx = buildExecutionControlContext({
    request,
    cachedResponse: cached,
    policyOverrides: { allowMediumDedupReplay: allowMedium },
    nowMs,
  });
  if (!ctx) {
    return { action: 'BYPASS_DEDUP_FORCE_FRESH', reason: 'NO_REPLAY_PROVENANCE' };
  }

  const decision = decideExecution(ctx, options?.bias);
  if (decision.mode === 'REUSE' && decision.reuseArtifact) {
    return { action: 'SERVE_DEDUP' };
  }
  return {
    action: 'BYPASS_DEDUP_FORCE_FRESH',
    reason: `ECPS_${decision.mode}_${decision.kernel}_${decision.confidenceGate}`,
  };
}
