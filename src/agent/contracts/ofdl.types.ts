/**
 * OFDL — Operator Field DSL: causal **state transformation** language over Φ (not workflow / prompt DSL).
 *
 * Primitives:
 * - State field Φ (`CausalFieldSnapshot`)
 * - Operators 𝒪 — discrete steps via COFT-EI (`applyCausalOperatorField`)
 * - Mode m — selects projection / dynamics slice within shared Kθ
 *
 * Stack: OFDL → COFT-EI → UKHF → concrete `gnnDynamicsStep`.
 */

export const OFDL_RUNTIME_SCHEMA = 'ofdl/runtime/v1' as const;

/**
 * Language-level projection modes (superset of UKHF EXEC/SHADOW).
 * REACT / SIMULATE are aliases over EXEC dynamics choice until separate physics land.
 */
export type OfdlProjectionMode = 'EXEC' | 'SHADOW' | 'REACT' | 'SIMULATE';

/** SPCL as declarative objective hook — gradient / Kθ update stays in services until learner exists. */
export interface OfdlSpclLearnPrimitive {
  objective: 'minimize_l2_norm_epsilon';
  optimizer: 'gradient_descent_stub';
}

export const DEFAULT_OFDL_SPCL_PRIMITIVE: OfdlSpclLearnPrimitive = {
  objective: 'minimize_l2_norm_epsilon',
  optimizer: 'gradient_descent_stub',
};
