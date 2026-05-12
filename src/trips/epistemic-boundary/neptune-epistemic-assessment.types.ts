/**
 * P-ECO-Closure-9 — Bounded epistemic reasoner summary (digest-facing; Neptune strategy remains unchanged).
 */

export interface EpistemicAssessment {
  /** True when undecidable regions or Gödel list non-empty / saturated horizon. */
  undecidable: boolean;
  /** Confidence horizon scalar [0,1]. */
  confidenceHorizon: number;
  /** Provable + empirically supported mass [0,1]. */
  proofCompleteness: number;
  /** Headroom under recursive self-reference risk [0,1]. */
  reasoningBoundary: number;
}
