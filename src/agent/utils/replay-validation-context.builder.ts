import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import type { WorldFreshnessVector } from '../contracts/world-freshness.types';
import type { RuntimeExecutionValidationContext } from '../contracts/runtime-execution-profile.validation.types';

/**
 * Builds validation context for replay correctness: cached snapshot vs current request snapshot.
 */
export function buildReplayValidationContextForDedupRequest(params: {
  cachedProvenance?: ReplayProvenance | null;
  request?: RouteAndRunRequestDto;
}): RuntimeExecutionValidationContext | undefined {
  const { cachedProvenance, request } = params;
  if (!cachedProvenance) return undefined;

  const opts = request?.options as
    | {
        replay_current_freshness?: Record<string, string>;
        replay_current_world_state_version?: string;
      }
    | undefined;

  const curFresh = opts?.replay_current_freshness as WorldFreshnessVector | undefined;

  return {
    replay_cached_freshness: cachedProvenance.freshness,
    replay_current_freshness: curFresh,
    replay_cached_world_state_version: cachedProvenance.aggregateWorldStateVersion,
    replay_current_world_state_version: opts?.replay_current_world_state_version?.trim(),
  };
}
