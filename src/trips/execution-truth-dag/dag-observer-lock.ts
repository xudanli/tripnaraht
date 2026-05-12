/**
 * P-Next 4 — DAG / IR / VM are compile-time + observation artifacts; they must not double as
 * runtime decision sources when observer collapse is enabled.
 */

/** Align with {@link DAGCanonicalPolicy} fields — kept standalone to avoid circular imports. */
export interface DagObserverPolicyFields {
  dagObserverOnly?: boolean;
  dagUsedForDecision?: boolean;
}

export interface DagObserverGuardInput {
  /** Migration trap: forbid re‑enabling DAG-driven repair routing while observer-only mode is on. */
  dagUsedForDecision?: boolean;
}

export function assertDagIsNonDecisionSource(input: DagObserverGuardInput): void {
  if (input.dagUsedForDecision) {
    throw new Error('DAG_DECISION_FORBIDDEN');
  }
}

/**
 * Enable via `policies.dagObserverOnly` or `TRIP_DAG_OBSERVER_ONLY=1`.
 * When true: Neptune merges **physics-first** repair triggers only (no IR CHECK triggers); VM trace is logged only.
 */
export function isDagObserverOnlyEnabled(policies?: DagObserverPolicyFields): boolean {
  if (policies?.dagObserverOnly === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_DAG_OBSERVER_ONLY === '1') {
    return true;
  }
  return false;
}
