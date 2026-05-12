/**
 * P-Evolution-1 — Identity Guardrail: observable mutation distance + optional enforce before ledger commit.
 */

export type IdentityGuardMode = 'observeOnly' | 'enforce';

/** Last guard evaluation (audit / replay). */
export interface EcoIdentityDriftEvent {
  at: string;
  tripId?: string;
  driftScore: number;
  threshold: number;
  mode: IdentityGuardMode;
  /** True when `enforce` and drift exceeded threshold — ledger not updated. */
  ledgerRejected: boolean;
  contributors: MutationDistanceContributors;
}

export interface MutationDistanceContributors {
  digestFingerprint: number;
  semanticCore: number;
  reflectiveLineage: number;
  causalModel: number;
  overlay: number;
}

export interface MutationDistanceResult {
  driftScore: number;
  contributors: MutationDistanceContributors;
  /** Filled by evaluator vs threshold. */
  exceededThreshold: boolean;
}

/** Snapshot after a successful guarded ledger commit — used for Δ causal / overlay + P-E2 lineage pointers on next tick. */
export interface EcoIdentityGuardSnapshot {
  causalModelHash: string;
  overlayFrameCount: number;
  dagNodeCount: number;
  /** Last accepted ledger node id (for parent pointer on next commit). */
  ledgerId?: string;
  branchId?: string;
  depth?: number;
}

export interface MutationDistanceWeights {
  digestFingerprint?: number;
  semanticCore?: number;
  reflectiveLineage?: number;
  causalModel?: number;
  overlay?: number;
}

export const DEFAULT_MUTATION_DISTANCE_WEIGHTS: Required<MutationDistanceWeights> = {
  digestFingerprint: 1,
  semanticCore: 1,
  reflectiveLineage: 1,
  causalModel: 1,
  overlay: 1,
};
