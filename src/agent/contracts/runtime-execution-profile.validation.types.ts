/**
 * Runtime semantic invariants for RuntimeExecutionProfile.
 * Anomalies are **not** transport failures: anomaly ≠ failure; severity spans a drift spectrum (INFO→ERROR).
 * Downstream: Runtime Policy Engine, aggregation, attribution, scheduler hooks.
 */

import type { WorldFreshnessVector } from './world-freshness.types';

export type RuntimeExecutionSeverity = 'INFO' | 'WARNING' | 'ERROR';

export type RuntimeExecutionAnomalyCategory =
  | 'SEMANTIC_DRIFT'
  | 'IMPOSSIBLE_STATE'
  | 'OBSERVABILITY_MISMATCH'
  | 'POLICY_VIOLATION';

/** Machine-readable policy hints for automated reaction (scheduler / cache / audit). */
export type RuntimeSuggestedPolicyAction =
  | 'DOWNGRADE_TO_LIGHTWEIGHT'
  | 'INVALIDATE_REPLAY'
  | 'FORCE_RECOMPUTE'
  | 'EMIT_AUDIT_EVENT';

export interface RuntimeExecutionAnomaly {
  code: string;
  severity: RuntimeExecutionSeverity;
  category: RuntimeExecutionAnomalyCategory;
  message: string;
  suggestedAction?: RuntimeSuggestedPolicyAction;
  /**
   * Selective cognition invalidation targets (dependency-aware replay).
   * When absent, policy may fall back to full recompute or aggregate hammer.
   */
  affectedCognitiveDomains?: string[];
  metadata?: Record<string, unknown>;
}

export interface RuntimeExecutionProfileValidationResult {
  /** Non-empty ⇒ at least one invariant fired; pipeline still completes unless outer policy throws. */
  anomalies: RuntimeExecutionAnomaly[];
}

/**
 * Optional cross-request context for invariants that depend on world/time (replay invalidation).
 * Prefer **WorldFreshnessVector** over a single aggregate version for dependency-aware invalidation.
 */
export interface RuntimeExecutionValidationContext {
  /** Legacy aggregate coherence check (hammer); prefer replay_*_freshness when available */
  replay_cached_world_state_version?: string;
  replay_current_world_state_version?: string;
  /** Cached response stamped freshness (per dimension) */
  replay_cached_freshness?: WorldFreshnessVector;
  /** Current request freshness snapshot */
  replay_current_freshness?: WorldFreshnessVector;
}
