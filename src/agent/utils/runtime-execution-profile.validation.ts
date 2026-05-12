import type { RuntimeExecutionProfile } from '../contracts/runtime-execution-profile.types';
import type {
  RuntimeExecutionAnomaly,
  RuntimeExecutionAnomalyCategory,
  RuntimeExecutionProfileValidationResult,
  RuntimeExecutionSeverity,
  RuntimeExecutionValidationContext,
  RuntimeSuggestedPolicyAction,
} from '../contracts/runtime-execution-profile.validation.types';
import {
  cognitiveDomainsForDriftedDimensions,
  driftedFreshnessDimensions,
} from './world-freshness.drift';

/** Invariant: DEDUP replay must not claim an executing engine. */
export const INV_DEDUP_ENGINE = 'INV.DEDUP_ENGINE';
/** Invariant: state-machine topology implies workflow cognition style. */
export const INV_SM_WORKFLOW_STYLE = 'INV.SM_WORKFLOW_STYLE';
/** Invariant: open-ended ReAct is not fully deterministic. */
export const INV_REACT_NOT_FULLY_DETERMINISTIC = 'INV.REACT_NOT_FULLY_DETERMINISTIC';
/** Invariant: no cognition depth ⇒ no tool depth. */
export const INV_DEPTH_NONE_TOOL_NONE = 'INV.DEPTH_NONE_TOOL_NONE';
/** Heuristic: ReAct rarely qualifies as FAST latency class. */
export const INV_FAST_REACT_LATENCY = 'INV.FAST_REACT_LATENCY';
/** Invariant: fresh execution implies something ran. */
export const INV_FRESH_REQUIRES_ENGINE = 'INV.FRESH_REQUIRES_ENGINE';
/** Invariant: dedup implies no cognition depth. */
export const INV_DEDUP_DEPTH_NONE = 'INV.DEDUP_DEPTH_NONE';
/** Replay reuse while world/plan snapshot drifted — semantic invalidation (future world model / verifier hook). */
export const INV_REPLAY_WORLD_STATE_DRIFT = 'INV.REPLAY_WORLD_STATE_DRIFT';

/** Aggregate hammer when only legacy single-version strings differ (no per-dimension vector yet). */
export const AGGREGATE_COGNITION_REPLAY_DOMAIN = 'FULL_COGNITION_REPLAY';

function anomaly(params: {
  code: string;
  severity: RuntimeExecutionSeverity;
  category: RuntimeExecutionAnomalyCategory;
  message: string;
  suggestedAction?: RuntimeSuggestedPolicyAction;
  affectedCognitiveDomains?: string[];
  metadata?: Record<string, unknown>;
}): RuntimeExecutionAnomaly {
  const { code, severity, category, message, suggestedAction, affectedCognitiveDomains, metadata } =
    params;
  return {
    code,
    severity,
    category,
    message,
    ...(suggestedAction ? { suggestedAction } : {}),
    ...(affectedCognitiveDomains?.length ? { affectedCognitiveDomains } : {}),
    ...(metadata && Object.keys(metadata).length ? { metadata } : {}),
  };
}

/**
 * Validates cross-field semantics of a RuntimeExecutionProfile (+ optional world snapshot context).
 * Does not throw — returns anomalies for observability / policy engines / anomaly lifecycle (emit→aggregate→react).
 */
export function validateRuntimeExecutionProfile(
  profile: RuntimeExecutionProfile,
  context?: RuntimeExecutionValidationContext,
): RuntimeExecutionProfileValidationResult {
  const anomalies: RuntimeExecutionAnomaly[] = [];
  const { cognition, execution, runtime } = profile;

  // Rule 1 — impossible state
  if (runtime.reusePolicy === 'DEDUP_REPLAY' && execution.engine !== 'NOT_RUN') {
    anomalies.push(
      anomaly({
        code: INV_DEDUP_ENGINE,
        severity: 'ERROR',
        category: 'IMPOSSIBLE_STATE',
        message: `reusePolicy=DEDUP_REPLAY requires execution.engine=NOT_RUN; got ${execution.engine}.`,
        suggestedAction: 'INVALIDATE_REPLAY',
      }),
    );
  }

  // Rule 2 — impossible state
  if (execution.engine === 'STATE_MACHINE' && cognition.style !== 'WORKFLOW') {
    anomalies.push(
      anomaly({
        code: INV_SM_WORKFLOW_STYLE,
        severity: 'ERROR',
        category: 'IMPOSSIBLE_STATE',
        message: `execution.engine=STATE_MACHINE requires cognition.style=WORKFLOW; got ${cognition.style}.`,
        suggestedAction: 'FORCE_RECOMPUTE',
      }),
    );
  }

  // Rule 3 — semantic drift (mis-labelling determinism)
  if (execution.engine === 'REACT_ORCHESTRATOR' && execution.determinism === 'DETERMINISTIC') {
    anomalies.push(
      anomaly({
        code: INV_REACT_NOT_FULLY_DETERMINISTIC,
        severity: 'WARNING',
        category: 'SEMANTIC_DRIFT',
        message: `execution.engine=REACT_ORCHESTRATOR should not use determinism=DETERMINISTIC (open-ended deliberation).`,
        suggestedAction: 'EMIT_AUDIT_EVENT',
        metadata: { engine: execution.engine, determinism: execution.determinism },
      }),
    );
  }

  // Rule 4 — impossible state
  if (cognition.depth === 'NONE' && execution.toolDepth !== 'NONE') {
    anomalies.push(
      anomaly({
        code: INV_DEPTH_NONE_TOOL_NONE,
        severity: 'ERROR',
        category: 'IMPOSSIBLE_STATE',
        message: `cognition.depth=NONE requires execution.toolDepth=NONE; got ${execution.toolDepth}.`,
        suggestedAction: 'FORCE_RECOMPUTE',
      }),
    );
  }

  // Rule 5 — soft drift (latency taxonomy / scheduler / streaming)
  if (runtime.latencyClass === 'FAST' && execution.engine === 'REACT_ORCHESTRATOR') {
    anomalies.push(
      anomaly({
        code: INV_FAST_REACT_LATENCY,
        severity: 'WARNING',
        category: 'SEMANTIC_DRIFT',
        message: `runtime.latencyClass=FAST with execution.engine=REACT_ORCHESTRATOR is unusual (latency taxonomy or scheduler drift).`,
        suggestedAction: 'DOWNGRADE_TO_LIGHTWEIGHT',
        metadata: { latencyClass: runtime.latencyClass, engine: execution.engine },
      }),
    );
  }

  // DEDUP ⇒ cognition off
  if (runtime.reusePolicy === 'DEDUP_REPLAY' && cognition.depth !== 'NONE') {
    anomalies.push(
      anomaly({
        code: INV_DEDUP_DEPTH_NONE,
        severity: 'ERROR',
        category: 'IMPOSSIBLE_STATE',
        message: `reusePolicy=DEDUP_REPLAY expects cognition.depth=NONE; got ${cognition.depth}.`,
        suggestedAction: 'INVALIDATE_REPLAY',
      }),
    );
  }

  // FRESH ⇒ engine ran
  if (runtime.reusePolicy === 'FRESH' && execution.engine === 'NOT_RUN') {
    anomalies.push(
      anomaly({
        code: INV_FRESH_REQUIRES_ENGINE,
        severity: 'ERROR',
        category: 'IMPOSSIBLE_STATE',
        message: `reusePolicy=FRESH implies execution occurred; execution.engine=NOT_RUN is inconsistent.`,
        suggestedAction: 'FORCE_RECOMPUTE',
      }),
    );
  }

  // Replay vs world — prefer WorldFreshnessVector (dependency-aware); fallback to aggregate version strings.
  const reuseReplayLike =
    runtime.reusePolicy === 'DEDUP_REPLAY' || runtime.reusePolicy === 'PARTIAL_REUSE';
  if (reuseReplayLike && context) {
    const dims = driftedFreshnessDimensions(
      context.replay_cached_freshness,
      context.replay_current_freshness,
    );
    if (dims.length > 0) {
      const domains = cognitiveDomainsForDriftedDimensions(dims);
      anomalies.push(
        anomaly({
          code: INV_REPLAY_WORLD_STATE_DRIFT,
          severity: 'ERROR',
          category: 'SEMANTIC_DRIFT',
          message: `replay stale: world freshness drift on dimensions: ${dims.join(', ')}.`,
          suggestedAction: 'INVALIDATE_REPLAY',
          affectedCognitiveDomains: domains.length ? domains : undefined,
          metadata: {
            driftedDimensions: dims,
            replay_cached_freshness: context.replay_cached_freshness,
            replay_current_freshness: context.replay_current_freshness,
            reusePolicy: runtime.reusePolicy,
            invalidationMode: 'PER_DIMENSION_FRESHNESS',
          },
        }),
      );
    } else {
      const cached = context.replay_cached_world_state_version?.trim();
      const current = context.replay_current_world_state_version?.trim();
      if (cached && current && cached !== current) {
        anomalies.push(
          anomaly({
            code: INV_REPLAY_WORLD_STATE_DRIFT,
            severity: 'ERROR',
            category: 'SEMANTIC_DRIFT',
            message: `replay stale: aggregate world/plan snapshot changed (${cached} → ${current}).`,
            suggestedAction: 'INVALIDATE_REPLAY',
            affectedCognitiveDomains: [AGGREGATE_COGNITION_REPLAY_DOMAIN],
            metadata: {
              replay_cached_world_state_version: cached,
              replay_current_world_state_version: current,
              reusePolicy: runtime.reusePolicy,
              invalidationMode: 'AGGREGATE_WORLD_VERSION',
            },
          }),
        );
      }
    }
  }

  return { anomalies };
}

/** Later anomalies overwrite earlier for the same `code` (deterministic merge). */
export function mergeRuntimeExecutionAnomaliesByCode(
  existing: RuntimeExecutionAnomaly[] | undefined,
  incoming: RuntimeExecutionAnomaly[],
): RuntimeExecutionAnomaly[] {
  const map = new Map<string, RuntimeExecutionAnomaly>();
  for (const a of existing ?? []) map.set(a.code, a);
  for (const a of incoming) map.set(a.code, a);
  return [...map.values()];
}
