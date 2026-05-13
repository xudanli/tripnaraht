import type { BudgetShadowAlert } from './research-team-budget-ledger.util';
import { pickBudgetRerollTargetFromReport, shouldTriggerBudgetRollback } from './research-team-budget-rollback.util';

describe('shouldTriggerBudgetRollback', () => {
  const mk = (ratio: number): readonly BudgetShadowAlert[] => [
    {
      code: 'BUDGET_OVERRUN_ALERT',
      total_user_budget: 10_000,
      total_estimated_cost: 10_000 * (1 + ratio),
      overrun_amount: 10_000 * ratio,
      overrun_ratio: ratio,
      high_marginal_utility_contributors: [],
    },
  ];

  it('returns false below threshold', () => {
    expect(shouldTriggerBudgetRollback(mk(0.1), 0.15)).toBe(false);
    expect(shouldTriggerBudgetRollback(undefined, 0.15)).toBe(false);
  });

  it('returns true at or above threshold', () => {
    expect(shouldTriggerBudgetRollback(mk(0.15), 0.15)).toBe(true);
    expect(shouldTriggerBudgetRollback(mk(0.2), 0.15)).toBe(true);
  });
});

describe('pickBudgetRerollTargetFromReport', () => {
  it('picks highest cost / low marginal_utility pressure', () => {
    const t = pickBudgetRerollTargetFromReport({
      lines: [
        { scope: 'hotel', estimated_cost: 8000, marginal_utility: 0.1 },
        { scope: 'flight', estimated_cost: 2000, marginal_utility: 0.9 },
      ],
      total_estimated_cost: 10_000,
    });
    expect(t?.scope).toBe('hotel');
    expect(t!.pressure_score).toBeGreaterThan(0);
  });
});
