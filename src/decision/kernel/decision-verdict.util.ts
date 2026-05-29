/**
 * 从 CGUS / OptimizationHints 候选列表构建可审计「决策判决书」。
 */

import type { OptimizationHints } from './decision-state.types';
import type { CGUSSearchResult } from '../../trips/decision/optimization/cgus-search.service';

export interface DecisionPlanVerdictRow {
  id: string;
  status: 'chosen' | 'rejected' | 'infeasible';
  rejection_reasons?: string[];
  hard_violation_count?: number;
  soft_penalty_degree?: number;
  expected_utility?: number;
  feasibility_probability?: number;
  utility_delta_vs_chosen?: number;
}

export interface OptimizationDecisionVerdict {
  chosen_plan_id: string;
  rejected_plans: DecisionPlanVerdictRow[];
  monte_carlo_summary?: {
    used: boolean;
    total_samples?: number;
    samples_per_candidate?: Record<string, number>;
  };
  fallback_chain?: Array<{ step: string; reason: string; timestamp?: string }>;
}

function violationReasons(
  violations: Array<{ type: string; severity: string; degree?: number; detail?: string }>,
): string[] {
  const reasons: string[] = [];
  for (const v of violations) {
    const deg = v.degree !== undefined ? ` degree=${v.degree}` : '';
    const det = v.detail ? ` (${v.detail})` : '';
    reasons.push(`${v.severity}:${v.type}${deg}${det}`);
  }
  return reasons.slice(0, 8);
}

function softDegree(
  violations: Array<{ severity: string; degree?: number }>,
): number {
  return violations
    .filter((v) => v.severity === 'SOFT')
    .reduce((s, v) => s + (v.degree ?? 0), 0);
}

/**
 * 由 CGUS 排序结果生成判决书（含弃选理由与 MC 采样摘要）。
 */
export function buildDecisionVerdictFromCgusResult(
  result: CGUSSearchResult,
  options?: {
    fallback_chain?: OptimizationDecisionVerdict['fallback_chain'];
  },
): OptimizationDecisionVerdict | undefined {
  const ranked = result.rankedCandidates;
  if (!ranked.length) return undefined;

  const chosenId =
    result.recommended?.id ??
    ranked.find((r) => r.candidate.feasible)?.candidate.id ??
    ranked[0].candidate.id;

  const chosenRow = ranked.find((r) => r.candidate.id === chosenId) ?? ranked[0];
  const chosenEu = chosenRow.expectedUtility ?? chosenRow.utility;

  const rejected_plans: DecisionPlanVerdictRow[] = [];

  for (const r of ranked) {
    if (r.candidate.id === chosenId) continue;

    const violations = r.candidate.constraintViolations ?? [];
    const hardCount = violations.filter((v) => v.severity === 'HARD').length;
    const eu = r.expectedUtility ?? r.utility;
    const status: DecisionPlanVerdictRow['status'] = !r.candidate.feasible || hardCount > 0
      ? 'infeasible'
      : 'rejected';

    const row: DecisionPlanVerdictRow = {
      id: r.candidate.id,
      status,
      hard_violation_count: hardCount,
      soft_penalty_degree: softDegree(violations),
      expected_utility: eu,
      feasibility_probability: r.feasibilityProbability,
    };

    if (chosenEu !== undefined && eu !== undefined) {
      row.utility_delta_vs_chosen = eu - chosenEu;
    }

    const reasons = violationReasons(violations);
    if (status === 'rejected' && reasons.length === 0 && eu !== undefined && chosenEu !== undefined) {
      reasons.push(`lower_expected_utility delta=${(eu - chosenEu).toFixed(3)}`);
    }
    if (reasons.length) row.rejection_reasons = reasons;

    rejected_plans.push(row);
  }

  const mc = result.monteCarloSamplingDetails;
  const monte_carlo_summary = {
    used: result.usedMonteCarlo,
    ...(mc
      ? {
          total_samples: mc.totalSamples,
          samples_per_candidate: mc.samplesPerCandidate,
        }
      : {}),
  };

  return {
    chosen_plan_id: chosenId,
    rejected_plans,
    monte_carlo_summary,
    ...(options?.fallback_chain?.length ? { fallback_chain: options.fallback_chain } : {}),
  };
}

/**
 * 由已物化的 OptimizationHints 重建判决书（explain 投影用）。
 */
export function buildDecisionVerdictFromHints(
  hints: OptimizationHints,
): OptimizationDecisionVerdict | undefined {
  const chosenId = hints.recommendedAlternativeId;
  if (!chosenId) return undefined;

  const alts = hints.alternatives ?? [];
  const chosenAlt = alts.find((a) => a.id === chosenId) ?? alts[0];
  const chosenScore = chosenAlt?.expectedUtility ?? chosenAlt?.score;

  const rejected_plans: DecisionPlanVerdictRow[] = alts
    .filter((a) => a.id !== chosenId)
    .map((a) => {
      const violations = a.violations ?? [];
      const hardCount = violations.filter((v) => v.severity === 'HARD').length;
      const softDegree = violations
        .filter((v) => v.severity === 'SOFT')
        .reduce((s, v) => s + (v.degree ?? 0), 0);
      const status: DecisionPlanVerdictRow['status'] =
        hardCount > 0 ? 'infeasible' : 'rejected';
      const eu = a.expectedUtility ?? a.score;
      const row: DecisionPlanVerdictRow = {
        id: a.id,
        status,
        hard_violation_count: hardCount,
        ...(softDegree > 0 ? { soft_penalty_degree: softDegree } : {}),
        expected_utility: eu,
        feasibility_probability: a.feasibilityProbability,
      };
      if (chosenScore !== undefined && eu !== undefined) {
        row.utility_delta_vs_chosen = eu - chosenScore;
      }
      const reasons = violationReasons(violations as any);
      if (status === 'rejected' && !reasons.length && row.utility_delta_vs_chosen !== undefined) {
        reasons.push(`lower_expected_utility delta=${row.utility_delta_vs_chosen.toFixed(3)}`);
      }
      if (reasons.length) row.rejection_reasons = reasons;
      return row;
    });

  return {
    chosen_plan_id: chosenId,
    rejected_plans,
    ...(hints.decisionVerdict?.monte_carlo_summary
      ? { monte_carlo_summary: hints.decisionVerdict.monte_carlo_summary }
      : {}),
    ...(hints.decisionVerdict?.fallback_chain?.length
      ? { fallback_chain: hints.decisionVerdict.fallback_chain }
      : {}),
  };
}
