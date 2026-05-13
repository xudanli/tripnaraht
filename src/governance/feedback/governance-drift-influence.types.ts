/**
 * Governance Feedback Injection Layer (GFIL) — drift-derived **vectors only**.
 * Never writes the governance ledger; never mutates policy.resolve bundles.
 */

export type GovernanceDriftInfluenceTarget =
  | 'planner_weights'
  | 'search_constraints'
  | 'activation_thresholds';

/**
 * Scalar nudge for runtime consumers (planner / search / activation router).
 * `suggestedDelta` is dimensionless v1 (−1..1 scale after gating).
 */
export interface GovernanceDriftInfluence {
  target: GovernanceDriftInfluenceTarget;
  suggestedDelta: number;
  confidence: number;
  driftReasonCodes: string[];
}

export interface ApplyDriftInfluenceGateOpts {
  /** Master gate; when false the layer returns an empty list (no runtime effect). */
  enabled: boolean;
  /** Minimum signal / inference confidence to pass the gate. */
  minConfidence?: number;
  /** Absolute cap on |suggestedDelta|. */
  maxAbsDelta?: number;
}
