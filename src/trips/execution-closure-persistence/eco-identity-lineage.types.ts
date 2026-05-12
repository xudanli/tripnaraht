/**
 * P-Evolution-2 — Lineage topology (observational): pointers + rejection edges + read-only graph view.
 * No merge / reconciliation semantics (P-E3+).
 */

/** Stable sentinel when no prior accepted ledger exists in-process. */
export const ECO_LINEAGE_GENESIS_ID = '__genesis__' as const;

export interface EcoIdentityLineage {
  ledgerId: string;
  /** Last accepted `ledgerId` before this commit (undefined at branch root). */
  parentLedgerId?: string;
  /** Identity fork label — default `main` via policy or snapshot carry-forward. */
  branchId: string;
  /** Identity step index (not wall-clock). */
  depth: number;
}

/** Failure edge on the identity graph (guard reject). */
export interface IdentityRejectionEdge {
  fromLedgerId: string;
  attemptedLedgerHash: string;
  mutationDistance: number;
  reason: string;
  at: string;
}

export interface EcoIdentityLineageGraphEdge {
  from: string;
  to: string;
  type: 'accepted' | 'rejected';
  attemptedLedgerHash?: string;
  mutationDistance?: number;
  reason?: string;
}
