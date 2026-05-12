/**
 * P-ECO-Closure-7 — Invariants that must persist across policy mutation (“same system” under Φ evolution).
 */

export interface ExecutionIdentity {
  /** Stable hash over trip context + causal lineage (not full DAG bytes). */
  semanticCoreHash: string;
  /** Named invariant families still honored by this run. */
  invariantCore: string[];
  /** Allowed normalized drift envelope for meta-updates [0,1]. */
  mutationEnvelope: number;
}
