/**
 * P-E3 — Identity trajectory physics (read-only path functional over the acceptance chain).
 * Does not merge ledgers or alter write semantics; purely derived observability.
 */

import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import type { IdentityRejectionEdge } from './eco-identity-lineage.types';

/** Scalar summary of path integral cost over an accepted identity trajectory. */
export interface IdentityPathCost {
  totalCost: number;
  components: {
    /** P-E1 — cumulative ledger mutation along consecutive accepted snapshots. */
    mutationEnergy: number;
    /** P-E2 — rejection intensity vs path length (#rejected_edges / path_length, capped). */
    rejectionPressure: number;
    /** ECO closure — internal consistency slack (1 − stabilityScore). */
    stabilityDecay: number;
    /** Topology — branch spread / ancestor-depth divergence along the path. */
    branchDivergence: number;
  };
  /** Deterministic comfort score in [0, 1]; higher is “lower cost”. */
  normalizedScore: number;
}

export interface ComputeIdentityPathCostParams {
  /** Ordered accepted ledger snapshots (each tick may append one node). */
  acceptedPath: EcoIdentityLedgerSnapshot[];
  rejectionEdges?: IdentityRejectionEdge[];
  /** `ecoClosure.final.stabilityScore` from the same closure tick (defaults to 1 → zero decay). */
  closureStabilityScore?: number;
}
