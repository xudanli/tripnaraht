/**
 * Frontend decision card projection — render only these fields; do not show raw causal graphs.
 */

import type { TravelCausalDecision } from '../types/travel-causal-decision.types';

export interface CausalDecisionCardView {
  title: string;
  whatHappened: string;
  whyItMatters: string[];
  latestActBy?: string;
  doNothing: string;
  recommendation?: {
    title: string;
    summary: string;
    rationale: string[];
  };
  verifiedChecks: Array<{ label: string; status: string }>;
  interventionDeadline?: string;
  missProbabilityDoNothing?: number;
  missProbabilityRecommended?: number;
}

export function projectCausalDecisionCard(
  decision: TravelCausalDecision,
): CausalDecisionCardView {
  const recommended = decision.recommendation
    ? decision.interventions.find((i) => i.optionId === decision.recommendation!.optionId)
    : decision.interventions.find((i) => i.recommended);

  const whyItMatters = decision.causalChain.map((e) => e.summary);

  const verifiedChecks =
    recommended?.validation.checks
      .filter((c) => c.status === 'PASS')
      .map((c) => ({ label: c.label, status: c.status })) ?? [];

  return {
    title: '需要决定',
    whatHappened: decision.observationSummary,
    whyItMatters,
    latestActBy: decision.temporalForecast.interventionDeadline,
    doNothing:
      decision.doNothingSummary ??
      formatDoNothing(decision.baselineOutcome.completionProbability),
    recommendation: recommended
      ? {
          title: recommended.title,
          summary: formatRecommended(recommended.expectedOutcome.completionProbability),
          rationale: decision.recommendation?.rationale ?? [],
        }
      : undefined,
    verifiedChecks,
    interventionDeadline: decision.temporalForecast.interventionDeadline,
    missProbabilityDoNothing: invertCompletion(decision.baselineOutcome.completionProbability),
    missProbabilityRecommended: invertCompletion(
      recommended?.expectedOutcome.completionProbability,
    ),
  };
}

function invertCompletion(completion?: number): number | undefined {
  if (completion == null || !Number.isFinite(completion)) return undefined;
  return Math.round((1 - completion) * 1000) / 1000;
}

function formatDoNothing(completion?: number): string {
  if (completion == null) return '不处理将承担更高履约风险。';
  const miss = Math.round((1 - completion) * 100);
  return `什么都不做：活动失约概率约 ${miss}%。`;
}

function formatRecommended(completion?: number): string {
  if (completion == null) return '推荐方案可降低履约风险。';
  return `履约概率提高至约 ${Math.round(completion * 100)}%。`;
}
