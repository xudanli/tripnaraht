/**
 * HT-CET — Higher Topos Causal Execution Theory (discrete realization).
 *
 * **Sheaf**: finite families of local Φ carriers (“sites”) + overlap consistency checks — not Grothendieck topology.
 * **Gluing**: compatibility between exec vs shadow sections via metric / certificate witnesses (replay condition proxy).
 * **Obstruction**: scalar summary of “cannot glue” (ε / diagram failure); SPCL drives it toward 0 in engineering terms.
 *
 * ECPS tiers index *which layer* selects routing semantics — site selection is encoded as `EcpsSiteLayer`.
 */

import type { CausalFieldSnapshot } from './multi-agent-causal-field.types';

export const HT_CET_SCHEMA = 'ht-cet/v1' as const;
export const HT_CET_SHEAF_BUNDLE_SCHEMA = 'ht-cet/sheaf-bundle/v1' as const;
export const HT_CET_GLUING_WITNESS_SCHEMA = 'ht-cet/gluing-witness/v1' as const;

/** ECPS₀ routing · ECPS₁ category mode · ECPS∞ logical site (topos selector stub). */
export type EcpsSiteLayer = 'ECPS_0' | 'ECPS_1' | 'ECPS_INF';

/** Local section over a named site (open set proxy in discrete runtime). */
export interface CausalSheafPatch {
  siteId: string;
  phi: CausalFieldSnapshot;
}

/** Finite bundle of local sections — global section exists when gluing obligations pass. */
export interface CausalSheafBundle {
  schema: typeof HT_CET_SHEAF_BUNDLE_SCHEMA;
  patches: CausalSheafPatch[];
}

/** Witness that overlapping locals agree on shared agents (sheaf gluing proxy). */
export interface SheafGluingWitness {
  schema: typeof HT_CET_GLUING_WITNESS_SCHEMA;
  /** Max RMS mismatch across checked overlapping pairs; 0 ⇒ pairwise identical on intersection lattice. */
  gluingResidualMax: number;
  /** All pairwise overlaps below threshold. */
  locallyGluable: boolean;
}

/** Obstruction digest — “H¹ ≠ 0” metaphor → numeric obstruction before SPCL collapse. */
export interface CohomologyObstructionDigest {
  obstructionScore: number;
  /** True when obstruction is below numerical floor (collapsed toward coherent section). */
  collapsesToZero: boolean;
}
