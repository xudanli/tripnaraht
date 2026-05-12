import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { WorldFreshnessVector } from '../contracts/world-freshness.types';

function traceSourceModel(trace: unknown): string | undefined {
  if (!trace || typeof trace !== 'object') return undefined;
  const t = trace as Record<string, unknown>;
  const orch = t.orchestration;
  if (orch && typeof orch === 'object') {
    const resolved = (orch as Record<string, unknown>).resolved;
    if (resolved && typeof resolved === 'object') {
      const m = (resolved as Record<string, unknown>).model;
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
  }
  return undefined;
}

/**
 * Stamp replay provenance when storing a response in the dedup cache.
 * Callers should invoke once before `cacheResponse`.
 */
export function buildReplayProvenanceFromRouteAndRun(args: {
  response: RouteAndRunResponseDto;
  request?: RouteAndRunRequestDto;
}): ReplayProvenance {
  const { response, request } = args;
  const obs = response.observability as Record<string, unknown> | undefined;
  const opts = request?.options as
    | {
        replay_current_freshness?: WorldFreshnessVector | Record<string, string>;
        replay_current_world_state_version?: string;
      }
    | undefined;

  const anomalies = obs?.runtime_execution_anomalies as
    | Array<{ affectedCognitiveDomains?: string[] }>
    | undefined;
  const domainSet = new Set<string>();
  if (Array.isArray(anomalies)) {
    for (const a of anomalies) {
      if (Array.isArray(a?.affectedCognitiveDomains)) {
        for (const d of a.affectedCognitiveDomains!) domainSet.add(d);
      }
    }
  }

  return {
    executionProfile: obs?.runtime_execution_profile as ReplayProvenance['executionProfile'],
    freshness: opts?.replay_current_freshness as WorldFreshnessVector | undefined,
    cognitionDomains: domainSet.size ? [...domainSet].sort() : undefined,
    generatedAt: Date.now(),
    sourceModel: traceSourceModel(obs?.trace),
    plannerVersion: process.env.TRIPNARA_PLANNER_VERSION ?? process.env.npm_package_version,
    policySnapshotVersion: process.env.TRIPNARA_POLICY_SNAPSHOT_VERSION,
    aggregateWorldStateVersion: opts?.replay_current_world_state_version?.trim(),
  };
}

/** Mutates `response.observability.replay_cache_provenance` in place for dedup storage. */
export function stampReplayCacheProvenanceOnResponse(
  response: RouteAndRunResponseDto,
  request?: RouteAndRunRequestDto,
): void {
  const prov = buildReplayProvenanceFromRouteAndRun({ response, request });
  const obs = response.observability as Record<string, unknown>;
  response.observability = {
    ...obs,
    replay_cache_provenance: prov,
  } as RouteAndRunResponseDto['observability'];
}
