/**
 * P-ECO-Closure-10 — What persists as “the same system” under continual mutation.
 */

export interface ExistentialIdentity {
  /** Named invariants that must not be violated by adaptation (ontology-level). */
  invariantCore: string[];
  /** [0,1] — overlap of semantic carriers across the mutation arc. */
  semanticContinuity: number;
  /** [0,1] — reflective / meta layers still aligned with kernel boundary. */
  reflectivePersistence: number;
  /** Authorized drift radius for identity-preserving updates [0,1]. */
  mutationEnvelope: number;
  /** Immutable anchor label (trusted kernel / lineage root). */
  ontologicalAnchor: string;
}
