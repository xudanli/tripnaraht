import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { ReplayArtifactDescriptor } from '../contracts/replay-artifact-descriptor.types';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { WorldFreshnessVector } from '../contracts/world-freshness.types';
import type { ReplayEligibilityClass } from '../contracts/replay-artifact-kinds.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';
import { computeArtifactReplayConfidence } from './artifact-replay-confidence.builder';

function resolveModeHint(
  obs: RouteAndRunResponseDto['observability'],
): ExecutionControlContext['modeHint'] {
  const trace = obs?.trace as
    | { orchestration?: { resolved?: { mode?: string } } }
    | undefined;
  const m = trace?.orchestration?.resolved?.mode;
  if (m === 'CLAUDE_DYNAMIC') return 'CLAUDE_DYNAMIC';
  if (m === 'CLAUDE_SM') return 'CLAUDE_SM';
  if (m === 'LEGACY') return 'LEGACY';
  return undefined;
}

/**
 * Builds ECPS input from a dedup cache candidate + current request (freshness from request options).
 */
export function buildExecutionControlContext(params: {
  request: RouteAndRunRequestDto;
  cachedResponse: RouteAndRunResponseDto;
  policyOverrides?: ExecutionControlContext['policyOverrides'];
  nowMs?: number;
}): ExecutionControlContext | undefined {
  const { request, cachedResponse, policyOverrides, nowMs } = params;
  const obs = cachedResponse.observability as {
    replay_cache_provenance?: ReplayProvenance;
    replay_artifact_descriptor?: ReplayArtifactDescriptor;
    runtime_execution_anomalies?: RuntimeExecutionAnomaly[];
  };

  const prov = obs.replay_cache_provenance;
  if (!prov) return undefined;

  const desc = obs.replay_artifact_descriptor;
  const eligibility: ReplayEligibilityClass = desc?.replayEligibility ?? 'FULL';

  /** Always re-score at read time — descriptor.replayConfidence is a write-time snapshot. */
  const replayConfidence = computeArtifactReplayConfidence({
    replayEligibility: eligibility,
    provenance: prov,
    runtimeExecutionAnomalies: obs.runtime_execution_anomalies,
    nowMs,
  });

  const opts = request.options as
    | { replay_current_freshness?: WorldFreshnessVector }
    | undefined;
  const freshness: WorldFreshnessVector = {
    ...(opts?.replay_current_freshness ?? {}),
  };

  const artifactId = desc?.artifactIdentity?.artifactId ?? 'artifact_unknown';

  return {
    artifactId,
    replayConfidence,
    replayEligibility: eligibility,
    anomalies: obs.runtime_execution_anomalies ?? [],
    freshness,
    provenance: prov,
    routeHint: cachedResponse.route?.route,
    modeHint: resolveModeHint(cachedResponse.observability),
    ...(policyOverrides ? { policyOverrides } : {}),
  };
}
