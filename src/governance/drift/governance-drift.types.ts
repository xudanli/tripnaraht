/**
 * Governance Drift & Re-Escalation (GDRES) — read-only signals from ledger replay.
 * Nothing here mutates policy or the GRSM ledger.
 */

export type GovernanceDriftSignalType = 'recurring_block' | 'policy_insufficient' | 'world_regression';

/** Drift / re-escalation risk inferred from durable history (v1 heuristics). */
export interface GovernanceDriftSignal {
  type: GovernanceDriftSignalType;
  /** 0–1; higher = stronger evidence for this signal. */
  confidence: number;
  /** Ledger ids supporting the signal (auditable). */
  evidenceEventIds: string[];
  /** Stable codes for traces / GRG annotations. */
  driftReasonCodes: string[];
}

/** Recovery Quality Index (RQI) — unified scalar for optimization / ops (read-only). */
export interface GovernanceRecoveryQualityScore {
  /** 0 = poor, 1 = ideal (deterministic v1 heuristic). */
  score: number;
  /** Times ledger entered RECOVERING via `replanning_succeeded`. */
  recoveryCycleCount: number;
  /** Same block id resolved more than once, or repeated corridor block pattern. */
  recurrenceCount: number;
  /** Last RECOVERING→NORMAL gap (ms) if derivable from transition rows. */
  lastRecoveryDurationMs?: number;
}
