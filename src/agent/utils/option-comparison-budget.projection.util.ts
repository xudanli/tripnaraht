import type {
  OptionComparisonBffDto,
  OptionComparisonBudgetDto,
} from '../dto/option-comparison.dto';
import type { BudgetComparePlansResponse } from '../../trips/services/budget-evaluation.service';

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  JPY: '¥',
};

export function formatBudgetCostDisplayValue(
  estimatedCost: number,
  currency: string,
  budgetUsagePercent?: number,
): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const amount = `${symbol}${Math.round(estimatedCost).toLocaleString('zh-CN')}`;
  if (budgetUsagePercent != null && Number.isFinite(budgetUsagePercent)) {
    return `${amount} · ${budgetUsagePercent}%`;
  }
  return amount;
}

/** cost 维度：分数越低表示越省（与 architect compare 语义一致） */
export function costScoreFromBudgetUsage(budgetUsagePercent: number): number {
  return Math.max(0, Math.min(100, Math.round(budgetUsagePercent)));
}

export function mapBudgetPlanRowToOptionBudget(
  row: BudgetComparePlansResponse['plans'][number],
  currency: string,
): OptionComparisonBudgetDto {
  return {
    estimatedCost: row.estimatedCost,
    currency,
    budgetUsagePercent: row.budgetUsagePercent,
    vsIntentDelta: row.vsIntentDelta,
    verdict: row.verdict,
    costDisplayValue: formatBudgetCostDisplayValue(
      row.estimatedCost,
      currency,
      row.budgetUsagePercent,
    ),
    topHotspot: row.topHotspot,
  };
}

export function applyBudgetComparisonToOptionComparison(
  comparison: OptionComparisonBffDto,
  budgetCompare: BudgetComparePlansResponse,
): OptionComparisonBffDto {
  const byPlanId = new Map(budgetCompare.plans.map((p) => [p.planId, p]));

  const options = comparison.options.map((option) => {
    const row = byPlanId.get(option.optionId);
    if (!row) return option;

    const budget = mapBudgetPlanRowToOptionBudget(row, budgetCompare.currency);
    const costScore = costScoreFromBudgetUsage(row.budgetUsagePercent);
    const summary =
      option.summary ??
      (row.topHotspot ? row.topHotspot : `预算占用 ${row.budgetUsagePercent}%`);

    return {
      ...option,
      label: option.label ?? row.label,
      scores: {
        ...option.scores,
        cost: costScore,
      },
      budget,
      summary,
    };
  });

  const budgetRecommendedId = budgetCompare.recommendedPlanId;
  let recommendation = comparison.recommendation;
  if (budgetRecommendedId && options.some((o) => o.optionId === budgetRecommendedId)) {
    const row = byPlanId.get(budgetRecommendedId);
    recommendation = {
      optionId: budgetRecommendedId,
      reason:
        comparison.recommendation?.optionId === budgetRecommendedId
          ? comparison.recommendation.reason
          : `预算门控推荐：${row?.label ?? budgetRecommendedId}（${row?.verdict ?? 'ALLOW'}，占用 ${row?.budgetUsagePercent ?? '?'}%）`,
    };
  }

  const kernelGateEval = mergeBudgetGateEval(comparison, budgetCompare);

  return {
    ...comparison,
    options,
    recommendation,
    kernelGateEval,
    budgetComparison: {
      schema: 'tripnara.budget_comparison@v1',
      intentTotal: budgetCompare.intentTotal,
      currency: budgetCompare.currency,
      recommendedPlanId: budgetCompare.recommendedPlanId,
    },
  };
}

function mergeBudgetGateEval(
  comparison: OptionComparisonBffDto,
  budgetCompare: BudgetComparePlansResponse,
): OptionComparisonBffDto['kernelGateEval'] {
  const existing = comparison.kernelGateEval?.optionDeltas ?? [];
  const existingIds = new Set(existing.map((d) => d.optionId));

  const budgetDeltas = budgetCompare.plans
    .filter((p) => !existingIds.has(p.planId))
    .map((p) => ({
      optionId: p.planId,
      gateStatus: mapBudgetVerdictToGateStatus(p.verdict),
      violationCount: p.violationCount,
      violationTypes: p.violationCount > 0 ? ['budget'] : [],
    }));

  if (budgetDeltas.length === 0 && !comparison.kernelGateEval) {
    return undefined;
  }

  const optionDeltas = [...existing];
  for (const delta of budgetDeltas) {
    const idx = optionDeltas.findIndex((d) => d.optionId === delta.optionId);
    if (idx >= 0) {
      optionDeltas[idx] = {
        ...optionDeltas[idx],
        gateStatus: pickStricterGate(optionDeltas[idx].gateStatus, delta.gateStatus),
        violationCount: Math.max(optionDeltas[idx].violationCount, delta.violationCount),
        violationTypes: Array.from(
          new Set([...optionDeltas[idx].violationTypes, ...delta.violationTypes]),
        ),
      };
    } else {
      optionDeltas.push(delta);
    }
  }

  return {
    optionDeltas,
    divergesFromLlmRecommendation:
      comparison.kernelGateEval?.divergesFromLlmRecommendation ??
      (budgetCompare.recommendedPlanId != null &&
        comparison.recommendation?.optionId != null &&
        budgetCompare.recommendedPlanId !== comparison.recommendation.optionId),
    llmRecommendedOptionId:
      comparison.kernelGateEval?.llmRecommendedOptionId ?? comparison.recommendation?.optionId,
    recommendedByGate:
      budgetCompare.recommendedPlanId ?? comparison.kernelGateEval?.recommendedByGate,
  };
}

function mapBudgetVerdictToGateStatus(
  verdict: BudgetComparePlansResponse['plans'][number]['verdict'],
): 'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK' {
  if (verdict === 'REJECT') return 'REJECT';
  if (verdict === 'NEED_ADJUST' || verdict === 'NEED_CONFIRM') return 'NEED_CONFIRM';
  return 'ALLOW';
}

const GATE_SEVERITY: Record<'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK', number> = {
  ALLOW: 0,
  NEED_CONFIRM: 1,
  REJECT: 2,
  BLOCK: 3,
};

function pickStricterGate(
  a: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK',
  b: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK',
): 'ALLOW' | 'NEED_CONFIRM' | 'REJECT' | 'BLOCK' {
  return GATE_SEVERITY[a] >= GATE_SEVERITY[b] ? a : b;
}

export function buildOptionComparisonFromBudgetCompare(
  budgetCompare: BudgetComparePlansResponse,
): OptionComparisonBffDto {
  const base: OptionComparisonBffDto = {
    schema: 'tripnara.option_comparison@v1',
    options: budgetCompare.plans.map((row) => ({
      optionId: row.planId,
      label: row.label,
      scores: {
        executability: row.verdict === 'ALLOW' ? 75 : row.verdict === 'NEED_CONFIRM' ? 60 : 45,
        cost: costScoreFromBudgetUsage(row.budgetUsagePercent),
        fatigue: 50,
        risk: row.verdict === 'REJECT' ? 70 : 30,
        experienceDensity: 55,
        freedom: 50,
      },
      summary: row.topHotspot ?? `预算占用 ${row.budgetUsagePercent}%`,
      budget: mapBudgetPlanRowToOptionBudget(row, budgetCompare.currency),
    })),
    recommendation: budgetCompare.recommendedPlanId
      ? {
          optionId: budgetCompare.recommendedPlanId,
          reason: `综合预算门控，推荐 ${budgetCompare.plans.find((p) => p.planId === budgetCompare.recommendedPlanId)?.label ?? budgetCompare.recommendedPlanId}`,
        }
      : undefined,
  };

  return applyBudgetComparisonToOptionComparison(base, budgetCompare);
}
