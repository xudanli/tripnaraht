/**
 * P-ECO-Closure-9 — Explicit catalogue of what the system cannot fully know or prove internally.
 */

export interface EpistemicLimit {
  /** Named regions of state space treated as undecidable under current observability. */
  undecidableRegions: string[];
  /** Axes of world state that remain partially latent (non-identifiable). */
  unknowableStateDimensions: string[];
  /** Classes of properties not internally provable in full generality. */
  proofBoundaries: string[];
  /** Budget / horizon limits on computation and observation (termination, passes). */
  computationalLimits: string[];
  /** [0,1] — saturation point beyond which extra reasoning yields negligible confidence gain. */
  confidenceHorizon: number;
}
