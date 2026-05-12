/**
 * COFT-EI — Causal Operator Field Theory for Execution Intelligence.
 *
 * 𝒪_{Kθ}[Φ](mode): a causal **operator field** indexed by structure Kθ (today: weighted adjacency;
 * later: quantized / composable operators). Mode selects which slice of the field acts on Φ (EXEC vs SHADOW).
 *
 * UKHF forward (`ukhfKernelForward`) is the concrete discrete realization of one 𝒪-step under matrix Kθ.
 */

import type { CausalInteractionKernel } from './multi-agent-causal-field.types';

export const COFT_EI_OPERATOR_FIELD_SCHEMA = 'coft-ei/operator-field/v1' as const;

/** Minimal 𝒪_{Kθ} carrier — extend when Kθ becomes a graphon / operator algebra beyond dense local K. */
export interface CausalOperatorFieldSpec {
  causalKernel: CausalInteractionKernel;
}
