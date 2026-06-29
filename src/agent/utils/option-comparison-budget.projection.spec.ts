import {
  applyBudgetComparisonToOptionComparison,
  buildOptionComparisonFromBudgetCompare,
  costScoreFromBudgetUsage,
  formatBudgetCostDisplayValue,
} from './option-comparison-budget.projection.util';
import { projectOptionComparison } from './option-comparison-bff.projection.util';
import type { BudgetComparePlansResponse } from '../../trips/services/budget-evaluation.service';

describe('option-comparison-budget.projection.util', () => {
  const budgetCompare: BudgetComparePlansResponse = {
    schema: 'tripnara.budget_comparison@v1',
    tripId: 'trip-1',
    intentTotal: 10000,
    currency: 'CNY',
    plans: [
      {
        planId: 'opt-a',
        label: '方案 A',
        estimatedCost: 9500,
        budgetUsagePercent: 95,
        vsIntentDelta: -500,
        verdict: 'NEED_ADJUST',
        violationCount: 0,
        categoryBreakdown: {
          accommodation: 4200,
          transportation: 2000,
          food: 1500,
          activities: 1800,
          other: 0,
        },
      },
      {
        planId: 'opt-b',
        label: '方案 B',
        estimatedCost: 7800,
        budgetUsagePercent: 78,
        vsIntentDelta: -2200,
        verdict: 'ALLOW',
        violationCount: 0,
        categoryBreakdown: {
          accommodation: 3000,
          transportation: 2000,
          food: 1300,
          activities: 1500,
          other: 0,
        },
      },
    ],
    recommendedPlanId: 'opt-b',
    priceEvidence: [],
  };

  it('maps lower usage to lower cost score', () => {
    expect(costScoreFromBudgetUsage(95)).toBe(95);
    expect(costScoreFromBudgetUsage(78)).toBe(78);
  });

  it('buildOptionComparisonFromBudgetCompare sets options[].budget', () => {
    const bff = buildOptionComparisonFromBudgetCompare(budgetCompare);
    expect(bff.options).toHaveLength(2);
    expect(bff.options[0].budget?.estimatedCost).toBe(9500);
    expect(bff.options[0].scores.cost).toBe(95);
    expect(bff.budgetComparison?.recommendedPlanId).toBe('opt-b');
    expect(bff.recommendation?.optionId).toBe('opt-b');
  });

  it('applyBudgetComparison merges into existing matrix cost column', () => {
    const base = projectOptionComparison({
      orchestratorState: {
        metadata: {
          comparison: {
            options: [
              {
                optionId: 'opt-a',
                scores: {
                  executability: 80,
                  cost: 40,
                  fatigue: 30,
                  experienceDensity: 70,
                  risk: 20,
                  freedom: 50,
                },
                summary: '稳健方案',
              },
              {
                optionId: 'opt-b',
                scores: {
                  executability: 65,
                  cost: 55,
                  fatigue: 45,
                  experienceDensity: 85,
                  risk: 35,
                  freedom: 60,
                },
                summary: '体验优先',
              },
            ],
            recommendation: { optionId: 'opt-a', reason: '综合更优' },
          },
        },
      } as never,
    })!;

    const merged = applyBudgetComparisonToOptionComparison(base, budgetCompare);
    expect(merged.options.find((o) => o.optionId === 'opt-b')?.scores.cost).toBe(78);
    expect(merged.options.find((o) => o.optionId === 'opt-b')?.budget?.costDisplayValue).toContain('¥');
    expect(merged.recommendation?.optionId).toBe('opt-b');
  });

  it('formatBudgetCostDisplayValue includes currency and percent', () => {
    expect(formatBudgetCostDisplayValue(9500, 'CNY', 95)).toContain('¥');
    expect(formatBudgetCostDisplayValue(9500, 'CNY', 95)).toContain('95%');
  });
});
