/**
 * Variational Cognitive Physics OS (VCPO) — execution as discrete least-action / stationary-action problem.
 *
 * 𝒮[τ] ≈ Σ L_k Δt with L ≈ E_metric + λ S_entropy − W_work (density proxies on each τ segment).
 */

export const VCPO_SCHEMA_VERSION = 'vcpos/v1';

export interface VariationalCognitivePhysicsSnapshot {
  schema_version: typeof VCPO_SCHEMA_VERSION;
  /** λ weight on entropy density (ties CTL entropy term into Lagrangian). */
  lambda_entropy: number;
  /** Discrete action functional Σ L_k (Δt = 1) — lower ⇒ nearer extremal band under this chart. */
  discrete_action: number;
  mean_lagrangian_density: number;
  /** Discrete Laplacian energy of {L_k} — proxy for Euler–Lagrange violation magnitude. */
  euler_lagrange_residual_proxy: number;
  segment_count: number;
}
