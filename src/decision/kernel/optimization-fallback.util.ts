/**
 * OPTIMIZE 降级链 — 供 adapter 写入 hints、因果叙事与用户可见 explain。
 */

import type { OptimizationHints } from './decision-state.types';
import type { OptimizationDecisionVerdict } from './decision-verdict.util';

export type OptimizationFallbackStep = { step: string; reason: string; timestamp?: string };

export function isCandidatePipelineEnabledFromEnv(): boolean {
  return (process.env.KERNEL_CGUS_USE_CANDIDATE_PIPELINE ?? '0').trim().toLowerCase() === '1';
}

export function appendFallbackStep(
  chain: OptimizationFallbackStep[],
  step: string,
  reason: string,
): OptimizationFallbackStep[] {
  return [...chain, { step, reason }];
}

/** 将 fallback_chain 并入 hints（写入 decisionVerdict，供 explain + 因果叙事消费） */
export function enrichHintsWithFallbackChain(
  hints: OptimizationHints,
  fallbackChain: OptimizationFallbackStep[],
  options?: { chosenPlanId?: string },
): OptimizationHints {
  if (!fallbackChain.length) return hints;

  const prev = hints.decisionVerdict;
  const verdict: OptimizationDecisionVerdict = {
    chosen_plan_id: options?.chosenPlanId ?? prev?.chosen_plan_id ?? hints.recommendedAlternativeId ?? 'current-plan',
    rejected_plans: prev?.rejected_plans ?? [],
    monte_carlo_summary: prev?.monte_carlo_summary,
    fallback_chain: [...(prev?.fallback_chain ?? []), ...fallbackChain],
  };

  return { ...hints, decisionVerdict: verdict };
}
