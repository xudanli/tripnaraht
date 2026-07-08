/**
 * OptionComparison BFF — Plan Studio 方案矩阵读模型（P0-1）
 */

import type { OptionComparison } from '../../skills/plan/shared/plan-state.types';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type {
  ExplainAlternativeBffDto,
  OptionComparisonBffDto,
  OptionComparisonScoresDto,
} from '../dto/option-comparison.dto';
import type { DualTrackItineraryUi } from './dual-track-itinerary-ui.util';
import type { BudgetComparePlansResponse } from '../../trips/services/budget-evaluation.service';
import { applyBudgetComparisonToOptionComparison, buildOptionComparisonFromBudgetCompare } from './option-comparison-budget.projection.util';

export type ProjectOptionComparisonInput = {
  orchestratorState?: OrchestratorState | null;
  decisionState?: DecisionState | null;
  primaryItinerary?: Itinerary | null;
  dualTrackUi?: DualTrackItineraryUi | null;
  /** 多方案预算对比 SSOT — 合并到 options[].budget 与 scores.cost */
  budgetComparison?: BudgetComparePlansResponse | null;
  candidates?: Array<{
    candidate_id?: string;
    explanation?: string;
    score_breakdown?: {
      total_utility?: number;
      dimensions?: { safety?: number; experience?: number; cost_efficiency?: number };
    };
    risk_profile?: { probability_of_drift?: number };
  }>;
};

const OPTION_LABEL_ZH: Record<string, string> = {
  plan_main: '主方案',
  plan_chosen: '当前推荐',
  plan_b_rain: '雨天备选（Plan B）',
  plan_b_contingency: '条件备选轨',
  dual_track_b: 'Plan B 分支',
  plan_conservative_pace: '保守节奏方案',
};

/** Plan Studio 主区默认可见列数（P2 overflow UI） */
export const OPTION_COMPARISON_DEFAULT_VISIBLE_COLUMNS = 3;

export function applyComparisonDisplayPolicy(
  comparison: OptionComparisonBffDto,
  visibleColumnCount = OPTION_COMPARISON_DEFAULT_VISIBLE_COLUMNS,
): OptionComparisonBffDto {
  const capped = Math.max(2, visibleColumnCount);
  if (comparison.options.length <= capped) {
    const { display: _d, ...rest } = comparison;
    return rest;
  }
  const overflowOptionIds = comparison.options.slice(capped).map((o) => o.optionId);
  return {
    ...comparison,
    display: {
      visibleColumnCount: capped,
      overflowCount: overflowOptionIds.length,
      overflowOptionIds,
    },
  };
}

function hasOptionId(options: OptionComparisonBffDto['options'], optionId: string): boolean {
  return options.some((o) => o.optionId === optionId);
}

function pushUniqueOption(
  options: OptionComparisonBffDto['options'],
  option: OptionComparisonBffDto['options'][number],
): void {
  if (!option.optionId || hasOptionId(options, option.optionId)) return;
  options.push(option);
}

/** P2：从 dual_track / fallback / repair 路线等补充第 3+ 列 */
function appendSupplementaryComparisonOptions(
  options: OptionComparisonBffDto['options'],
  input: ProjectOptionComparisonInput,
): void {
  if (input.dualTrackUi?.mode === 'dual_track') {
    for (const branch of input.dualTrackUi.axis_b_branches ?? []) {
      const id = String(branch.branch_id ?? '').trim() || `dual_track_${options.length}`;
      pushUniqueOption(options, {
        optionId: id,
        label: labelForOptionId('dual_track_b', branch.trigger_label_zh),
        scores: {
          executability: 55,
          cost: 60,
          fatigue: 50,
          risk: 45,
          experienceDensity: 50,
          freedom: 40,
        },
        summary: branch.summary_zh ?? branch.trigger_condition ?? '条件激活备选轨',
      });
    }
  }

  const md = input.orchestratorState?.metadata as Record<string, unknown> | undefined;
  const fallbacks = md?.fallback_plans as Array<{ id?: string; name?: string; strategy?: string }> | undefined;
  for (const fb of fallbacks ?? []) {
    const id = String(fb.id ?? fb.strategy ?? '').trim();
    if (!id) continue;
    pushUniqueOption(options, {
      optionId: id,
      label: labelForOptionId(id, fb.name ?? fb.strategy),
      scores: { executability: 50, cost: 55, fatigue: 50, risk: 40, experienceDensity: 48, freedom: 45 },
      summary: fb.strategy ? `备选策略：${fb.strategy}` : '系统生成的备选方案',
    });
  }

  const pacingMode = md?.fallback_pacing_mode;
  if (pacingMode === 'conservative') {
    pushUniqueOption(options, {
      optionId: 'plan_conservative_pace',
      label: labelForOptionId('plan_conservative_pace'),
      scores: { executability: 72, cost: 52, fatigue: 38, risk: 28, experienceDensity: 58, freedom: 48 },
      summary: '保守节奏：降低单日强度与回溯风险',
    });
  }

  for (const route of input.orchestratorState?.alternatives?.alternative_routes ?? []) {
    const id = String(route.route_id ?? '').trim();
    if (!id) continue;
    pushUniqueOption(options, {
      optionId: id.startsWith('plan_') ? id : `route_${id}`,
      label: labelForOptionId(id, route.description?.slice(0, 40)),
      scores: { executability: 58, cost: 54, fatigue: 48, risk: 42, experienceDensity: 52, freedom: 46 },
      summary: route.reason || route.description || '修复/替代路线方案',
    });
  }
}

function finalizeComparison(comparison: OptionComparisonBffDto): OptionComparisonBffDto {
  return applyComparisonDisplayPolicy({
    ...comparison,
    options: comparison.options.slice(0, 10),
  });
}

function clampScore100(x: unknown, invert = false): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined;
  const v = Math.max(0, Math.min(1, x));
  const scaled = Math.round(v * 100);
  return invert ? 100 - scaled : scaled;
}

function scoresFromAlt(a: {
  expectedUtility?: number;
  score?: number;
  feasibilityProbability?: number;
  violations?: Array<{ type?: string; severity?: string }>;
}): OptionComparisonScoresDto {
  const util = clampScore100(a.expectedUtility ?? a.score);
  const feas = clampScore100(a.feasibilityProbability);
  const exec = feas ?? util ?? 50;
  const hardViolations = (a.violations ?? []).filter((v) => v.severity === 'HARD').length;
  const softViolations = (a.violations ?? []).filter((v) => v.severity === 'SOFT').length;
  return {
    executability: exec,
    cost: clampScore100(a.expectedUtility != null ? 1 - Number(a.expectedUtility) * 0.3 : undefined, false) ?? 50,
    fatigue: clampScore100(softViolations * 0.15, false) ?? 40,
    risk: clampScore100(hardViolations * 0.25 + (1 - (feas ?? 0.5)) * 0.5, false) ?? 30,
    experienceDensity: util ?? 55,
    freedom: 50,
  };
}

function scoresFromCandidate(c: NonNullable<ProjectOptionComparisonInput['candidates']>[number]): OptionComparisonScoresDto {
  const dims = c.score_breakdown?.dimensions;
  const util = clampScore100(c.score_breakdown?.total_utility);
  return {
    executability: util ?? 60,
    cost: clampScore100(dims?.cost_efficiency) ?? 50,
    fatigue: clampScore100(dims?.safety, true) ?? 45,
    risk: clampScore100(c.risk_profile?.probability_of_drift) ?? 35,
    experienceDensity: clampScore100(dims?.experience) ?? 55,
    freedom: 50,
  };
}

function labelForOptionId(optionId: string, fallback?: string): string {
  if (OPTION_LABEL_ZH[optionId]) return OPTION_LABEL_ZH[optionId];
  if (fallback?.trim()) return fallback.trim().slice(0, 40);
  if (/^plan[_-]/i.test(optionId)) return optionId.replace(/^plan[_-]/i, '方案 ').slice(0, 40);
  return optionId.replace(/_/g, ' ').slice(0, 40);
}

function fromWorkbenchComparison(raw: OptionComparison): OptionComparisonBffDto {
  return finalizeComparison({
    schema: 'tripnara.option_comparison@v1',
    options: raw.options.map((o) => ({
      optionId: o.optionId,
      label: labelForOptionId(o.optionId, o.summary),
      scores: {
        executability: o.scores.executability,
        cost: o.scores.cost,
        fatigue: o.scores.fatigue,
        risk: o.scores.risk,
        experienceDensity: o.scores.experienceDensity,
        freedom: o.scores.freedom,
      },
      summary: o.summary,
    })),
    recommendation: raw.recommendation,
    kernelGateEval: raw.kernelGateEval
      ? {
          optionDeltas: raw.kernelGateEval.optionDeltas.map((d) => ({
            optionId: d.optionId,
            gateStatus:
              String(d.gateStatus).toUpperCase() === 'BLOCK'
                ? 'REJECT'
                : (d.gateStatus as 'ALLOW' | 'NEED_CONFIRM' | 'REJECT'),
            violationCount: d.violationCount,
            violationTypes: d.violationTypes,
          })),
          divergesFromLlmRecommendation: raw.kernelGateEval.divergesFromLlmRecommendation,
          llmRecommendedOptionId: raw.kernelGateEval.llmRecommendedOptionId,
          recommendedByGate: raw.kernelGateEval.recommendedByGate,
        }
      : undefined,
  });
}

function fromOptimizationHints(input: ProjectOptionComparisonInput): OptionComparisonBffDto | undefined {
  const hints = input.decisionState?.optimizationHints;
  const alts = hints?.alternatives ?? [];
  const options: OptionComparisonBffDto['options'] = [];

  if (input.primaryItinerary) {
    options.push({
      optionId: 'plan_main',
      label: labelForOptionId('plan_main'),
      scores: {
        executability: 70,
        cost: 50,
        fatigue: 45,
        risk: 30,
        experienceDensity: 65,
        freedom: 55,
      },
      summary: '当前编排主方案',
    });
  }

  for (const a of alts) {
    const id = String(a.id ?? '').trim();
    if (!id) continue;
    options.push({
      optionId: id,
      label: labelForOptionId(id, typeof (a as { label?: string }).label === 'string' ? (a as { label?: string }).label : undefined),
      scores: scoresFromAlt(a),
      summary:
        typeof (a as { summary?: string }).summary === 'string'
          ? (a as { summary?: string }).summary
          : `可行度约 ${Math.round((a.feasibilityProbability ?? a.score ?? 0.5) * 100)}%`,
    });
  }

  appendSupplementaryComparisonOptions(options, input);

  if (options.length < 2) return undefined;

  const recommendedId =
    hints?.recommendedAlternativeId ??
    hints?.decisionVerdict?.chosen_plan_id ??
    options[0].optionId;

  const reason =
    hints?.decisionVerdictNarrationZh ??
    hints?.metaDecisionAudit ??
    `综合可行性与体验，推荐「${labelForOptionId(recommendedId)}」。`;

  return finalizeComparison({
    schema: 'tripnara.option_comparison@v1',
    options,
    recommendation: {
      optionId: recommendedId,
      reason: String(reason).slice(0, 300),
    },
  });
}

function fromCandidates(input: ProjectOptionComparisonInput): OptionComparisonBffDto | undefined {
  const cands = input.candidates ?? [];
  if (cands.length < 2) return undefined;
  return finalizeComparison({
    schema: 'tripnara.option_comparison@v1',
    options: cands.map((c) => ({
      optionId: c.candidate_id!,
      label: labelForOptionId(c.candidate_id!, c.explanation),
      scores: scoresFromCandidate(c),
      summary: c.explanation ?? undefined,
    })),
    recommendation: {
      optionId: cands[0].candidate_id!,
      reason: cands[0].explanation ?? '综合评分最高',
    },
  });
}

export function projectOptionComparison(input: ProjectOptionComparisonInput): OptionComparisonBffDto | undefined {
  const md = input.orchestratorState?.metadata as Record<string, unknown> | undefined;
  const budgetComparison =
    input.budgetComparison ??
    (md?.budgetComparison as BudgetComparePlansResponse | undefined);

  const wbComparison = md?.comparison as OptionComparison | undefined;
  let comparison: OptionComparisonBffDto | undefined;
  if ((wbComparison?.options?.length ?? 0) >= 2 && wbComparison) {
    comparison = fromWorkbenchComparison(wbComparison);
  } else {
    comparison = fromOptimizationHints(input) ?? fromCandidates(input);
  }

  if (!comparison && budgetComparison && budgetComparison.plans.length >= 2) {
    return buildOptionComparisonFromBudgetCompare(budgetComparison);
  }

  if (!comparison) return undefined;

  if (budgetComparison && budgetComparison.plans.length >= 2) {
    return applyBudgetComparisonToOptionComparison(comparison, budgetComparison);
  }

  return comparison;
}

export function projectExplainAlternatives(
  comparison: OptionComparisonBffDto | undefined,
): ExplainAlternativeBffDto[] | undefined {
  if (!comparison || comparison.options.length < 2) return undefined;
  const recId = comparison.recommendation?.optionId;
  return comparison.options.map((o) => ({
    id: o.optionId,
    label: o.label ?? labelForOptionId(o.optionId),
    dimension_scores: o.scores,
    is_recommended: o.optionId === recId,
    caveat: o.summary,
  }));
}

export function attachOptionComparisonToResponse(input: {
  payload: Record<string, unknown>;
  explain?: Record<string, unknown>;
  projectInput: ProjectOptionComparisonInput;
}): void {
  const comparison = projectOptionComparison(input.projectInput);
  if (!comparison) {
    delete input.payload.comparison;
    return;
  }
  input.payload.comparison = comparison;
  const alternatives = projectExplainAlternatives(comparison);
  if (alternatives?.length) {
    input.explain = { ...(input.explain ?? {}), alternatives };
  }
}
