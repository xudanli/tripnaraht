/**
 * P-ECO-Closure-7 — Second-order reflection: drift of policies and causal structure vs defaults / priors.
 */

export interface MetaReflection {
  /** Deviation of active closure thresholds from canonical defaults [0,1]. */
  policyDrift: number;
  /** Movement of ε_residual / ε_manifold vs baseline semantics [0,1]. */
  convergenceRuleChange: number;
  /** Causal meta revision / epistemic churn proxy [0,1]. */
  semanticMutation: number;
  /** Structural complexity / churn proxy over causal edges [0,1]. */
  causalTopologyMutation: number;
}
