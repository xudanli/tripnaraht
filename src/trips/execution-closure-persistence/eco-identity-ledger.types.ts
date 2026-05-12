/**
 * Cross-run persistence for existential continuity — survives within TripWorldState.signals between repairPlan invocations.
 */

import type { EcoIdentityLineage } from './eco-identity-lineage.types';

/** Compact anchor persisted after each ECO closure tick (product / runtime continuity proof input). */
export interface EcoIdentityLedgerSnapshot {
  recordedAt: string;
  semanticCoreHash: string;
  reflectiveLineage: string;
  existentialContinuityScore: number;
  ontologicalIntegrity: number;
  epistemicUndecidable: boolean;
  confidenceSaturated: boolean;
  /** Prior tick requested freezing Φ evolution — honored next tick before second Neptune. */
  carryForwardMetaFreeze: boolean;
  /** Prior tick hit recursive boundary — honored next tick before second Neptune. */
  carryForwardRecursiveFreeze: boolean;
  /** Prior contraction certificate suggested rollback bias — forces full Neptune retry over minimal patch. */
  carryForwardSuggestRollback: boolean;
  /** Stable fingerprint of policy + lineage carriers for drift audits. */
  digestFingerprint: string;
  /** P-E2 — assigned only when `commitEcoIdentityLedger` accepts (not present on rejected proposals). */
  ecoIdentityLineage?: EcoIdentityLineage;
}

/** Proof comparing current tick ledger vs persisted prior (same process / warm state). */
export interface IdentityContinuityProof {
  priorRecordedAt?: string;
  sameSemanticCore: boolean;
  sameReflectiveLineage: boolean;
  continuityDelta: number;
  identityPreserved: boolean;
  reasons: string[];
}
