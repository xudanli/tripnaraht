import type {
  DedupValidationContextInput,
  InvalidationDecision,
  ReplayDecision,
  ReplayStampInput,
  ReplayValidationResult,
} from '../contracts/replay-lifecycle.types';
import type { RuntimeExecutionProfile } from '../contracts/runtime-execution-profile.types';
import type { RuntimeExecutionValidationContext } from '../contracts/runtime-execution-profile.validation.types';
import { stampReplayCacheProvenanceOnResponse } from './replay-provenance.builder';
import { buildReplayValidationContextForDedupRequest } from './replay-validation-context.builder';
import { validateRuntimeExecutionProfile } from './runtime-execution-profile.validation';
import { AGGREGATE_COGNITION_REPLAY_DOMAIN } from './runtime-execution-profile.validation';

/**
 * Single facade for replay correctness: stamp → validate → invalidation hints.
 * Keeps AgentService / observability glue thin as replay evolves into cognition memoization.
 */
export class ReplayLifecycleManager {
  /** Dedup gate already decided cache hit; extend with TTL / confidence decay later. */
  shouldReplay(params: { cacheHit: boolean }): ReplayDecision {
    return {
      allow: params.cacheHit,
      reasonCodes: params.cacheHit ? undefined : ['NO_CACHE_HIT'],
    };
  }

  validateReplay(
    profile: RuntimeExecutionProfile,
    context?: RuntimeExecutionValidationContext,
  ): ReplayValidationResult {
    return validateRuntimeExecutionProfile(profile, context);
  }

  /** Mutates `response.observability.replay_cache_provenance` — call immediately before cache write. */
  stampProvenance(input: ReplayStampInput): void {
    stampReplayCacheProvenanceOnResponse(input.response, input.request);
  }

  buildDedupValidationContext(
    input: DedupValidationContextInput,
  ): RuntimeExecutionValidationContext | undefined {
    return buildReplayValidationContextForDedupRequest(input);
  }

  /**
   * Maps validation anomalies → coarse invalidation scope for policy / scheduler (not yet persisted on DTO).
   */
  invalidateReplay(validation: ReplayValidationResult): InvalidationDecision {
    const actionable = validation.anomalies.filter(
      (a) =>
        a.suggestedAction === 'INVALIDATE_REPLAY' || a.suggestedAction === 'FORCE_RECOMPUTE',
    );
    if (actionable.length === 0) {
      return { scope: 'NONE' };
    }
    const domainSet = new Set<string>();
    for (const a of actionable) {
      for (const d of a.affectedCognitiveDomains ?? []) domainSet.add(d);
    }
    const domains = [...domainSet];
    const fullHammer =
      domains.includes(AGGREGATE_COGNITION_REPLAY_DOMAIN) || domains.length === 0;
    return {
      scope: fullHammer ? 'FULL_RESPONSE' : 'PARTIAL_COGNITIVE_BRANCH',
      ...(domains.length ? { domains } : {}),
      reasonCodes: actionable.map((a) => a.code),
    };
  }
}

export const replayLifecycleManager = new ReplayLifecycleManager();
