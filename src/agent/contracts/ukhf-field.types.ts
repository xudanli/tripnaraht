/**
 * UKHFS — Unified Kernel Hypothesis Field System.
 *
 * Single latent forward map 𝓕_{Kθ}(Φ, m): same causal kernel Kθ, different projection modes m.
 * - EXEC (execution / “CMAFT mode”): realized dynamics — Laplacian Euler or nonlinear stub.
 * - SHADOW (“NCGES inference mode”): linear Laplacian projection used for predictive shading.
 *
 * SPCL ε compares EXEC vs SHADOW outputs under identical Kθ — projection discrepancy, not two unrelated models.
 */

/** Inference / observability projection — linear Laplacian shadow step S(Φ, Kθ). */
export type UkhfProjectionMode = 'EXEC' | 'SHADOW';

/** EXEC branch only: 𝓕 realization (same enum surface as NCGES dynamics modes). */
export type UkhfExecDynamicsMode = 'LINEAR_LAPLACIAN' | 'MESSAGE_PASSING_STUB';
