import {
  buildPriceEvidence,
  formatBudgetProfilePromptBlock,
  pickRecommendedPlanId,
} from './budget-comparison.util';

describe('budget-comparison.util', () => {
  it('pickRecommendedPlanId prefers ALLOW over REJECT', () => {
    const id = pickRecommendedPlanId([
      {
        planId: 'a',
        label: 'A',
        estimatedCost: 9000,
        budgetUsagePercent: 90,
        vsIntentDelta: -1000,
        verdict: 'ALLOW',
        violationCount: 0,
        categoryBreakdown: {
          accommodation: 0,
          transportation: 0,
          food: 0,
          activities: 0,
          other: 0,
        },
      },
      {
        planId: 'b',
        label: 'B',
        estimatedCost: 8000,
        budgetUsagePercent: 80,
        vsIntentDelta: -2000,
        verdict: 'REJECT',
        violationCount: 1,
        categoryBreakdown: {
          accommodation: 0,
          transportation: 0,
          food: 0,
          activities: 0,
          other: 0,
        },
      },
    ]);
    expect(id).toBe('a');
  });

  it('buildPriceEvidence includes structure allocations', () => {
    const items = buildPriceEvidence({
      currency: 'CNY',
      intentTotal: 10000,
      structureAllocations: {
        transportation: 3000,
        accommodation: 500,
        experience: 5000,
        food: 1500,
        other: 0,
      },
    });
    expect(items.some((i) => i.type === 'structure_allocation')).toBe(true);
  });

  it('formatBudgetProfilePromptBlock includes L1 and gate', () => {
    const block = formatBudgetProfilePromptBlock({
      intentTotal: 10000,
      currency: 'CNY',
      gateVerdict: 'NEED_CONFIRM',
    });
    expect(block).toContain('L1 总预算');
    expect(block).toContain('NEED_CONFIRM');
  });
});
