/**
 * CT-CES — Category-Theoretic Causal Execution System (discrete engineering model).
 *
 * - **Ob(𝒞)**: causal state fields — `CausalFieldSnapshot` as object carriers.
 * - **Mor(𝒞)**: operator steps `Φ → Φ` realized by OFDL/COFT `applyOfdlOperator` (mode = morphism label).
 * - **Composition** `𝒪_k ∘ … ∘ 𝒪_1`: sequential field steps along a trace.
 * - **Commutativity witness**: same source Φ, two morphism families (exec vs shadow) — square closes if
 *   end states are close in the chosen Φ-metric (PCCS + GPM realize the witness).
 *
 * This is not a full bicategory formalization — it is a **typed API** for diagram-shaped checks.
 */

import type { CausalFieldSnapshot } from './multi-agent-causal-field.types';

export const CT_CES_SCHEMA = 'ct-ces/v1' as const;
export const CT_CES_DIAGRAM_WITNESS_SCHEMA = 'ct-ces/diagram-witness/v1' as const;

/** Object placeholder — today identical to the concrete field snapshot type. */
export type ObCausal = CausalFieldSnapshot;
