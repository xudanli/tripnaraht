/**
 * P-ECO-Closure-8 — “Computational self”: axioms + continuity + kernel boundary vs reflective layers.
 */

export interface ComputationalIdentity {
  /** Non-negotiable axioms (physical safety, termination, identity preservation). */
  coreAxioms: string[];
  /** [0,1] continuity of semantic hash / lineage across Φ evolution. */
  semanticContinuity: number;
  /** Normalized reflective depth ceiling actually honored [0,1]. */
  reflectiveBoundary: number;
  /** Trusted kernel label — immutable audit anchor. */
  trustedKernel: string;
}
