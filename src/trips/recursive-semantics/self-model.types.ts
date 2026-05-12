/**
 * P-ECO-Closure-8 — Explicit self-model: beliefs over world + meta-beliefs over those beliefs.
 */

export interface SelfModel {
  /** Scalar summaries of first-order epistemic stance toward signals / overlays / physics. */
  beliefsAboutWorld: Record<string, number>;
  /** Meta-beliefs: calibration of policies, proofs, and causal revision vs priors. */
  beliefsAboutBeliefs: Record<string, number>;
  /** Aggregate trust in the reasoning stack this tick [0,1]. */
  confidenceInReasoning: number;
  /** Stable semantic fingerprint (aligned with {@link ExecutionIdentity}). */
  semanticIdentity: string;
  /** Estimated recursion depth requested by meta-churn (bounded externally). */
  reflectiveDepth: number;
}
