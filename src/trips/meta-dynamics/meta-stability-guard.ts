/**
 * P-ECO-Closure-7 — Meta-divergence guard: freeze policy evolution when self-modification outruns stability budget.
 */

export const DEFAULT_META_STABILITY_LIMITS = {
  maxAdaptationRate: 0.55,
  maxConvergencePolicyMutation: 0.4,
} as const;

export interface MetaStabilityGuardResult {
  freezePolicyEvolution: boolean;
  reasons: string[];
  adaptationRateLimit: number;
  convergencePolicyMutationLimit: number;
}

export function evaluateMetaStabilityGuard(input: {
  adaptationRate: number;
  convergenceRuleChange: number;
  limits?: Partial<typeof DEFAULT_META_STABILITY_LIMITS>;
}): MetaStabilityGuardResult {
  const L = { ...DEFAULT_META_STABILITY_LIMITS, ...input.limits };
  const reasons: string[] = [];
  let freeze = false;
  if (input.adaptationRate > L.maxAdaptationRate) {
    freeze = true;
    reasons.push(`adaptationRate>${L.maxAdaptationRate}`);
  }
  if (input.convergenceRuleChange > L.maxConvergencePolicyMutation) {
    freeze = true;
    reasons.push(`convergencePolicyMutation>${L.maxConvergencePolicyMutation}`);
  }
  return {
    freezePolicyEvolution: freeze,
    reasons,
    adaptationRateLimit: L.maxAdaptationRate,
    convergencePolicyMutationLimit: L.maxConvergencePolicyMutation,
  };
}
