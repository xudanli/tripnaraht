import {
  accumulateResearchFinancialReport,
  buildResearchBudgetBucketsFromTotal,
  extractTripTotalBudget,
} from './research-team-budget-ledger.util';

describe('extractTripTotalBudget', () => {
  it('reads totalBudget / total_budget / budget.total / constraints.budget.total', () => {
    expect(extractTripTotalBudget({ totalBudget: 10000 })).toBe(10000);
    expect(extractTripTotalBudget({ total_budget: 8000 })).toBe(8000);
    expect(extractTripTotalBudget({ budget: { total: 7000 } })).toBe(7000);
    expect(extractTripTotalBudget({ constraints: { budget: { total: 6000 } } })).toBe(6000);
  });

  it('returns undefined for empty or invalid', () => {
    expect(extractTripTotalBudget(undefined)).toBeUndefined();
    expect(extractTripTotalBudget({ totalBudget: 0 })).toBeUndefined();
  });
});

describe('buildResearchBudgetBucketsFromTotal', () => {
  it('allocates positive targets that sum to total (within rounding)', () => {
    const m = buildResearchBudgetBucketsFromTotal(10000);
    const sum = Object.values(m).reduce((a, b) => a + b.target_amount, 0);
    expect(sum).toBe(10000);
    for (const b of Object.values(m)) {
      expect(b.hard_limit).toBeGreaterThanOrEqual(b.target_amount);
    }
  });
});

describe('accumulateResearchFinancialReport', () => {
  it('sums estimated costs and emits BUDGET_OVERRUN_ALERT when over trip budget', () => {
    const { report, alerts } = accumulateResearchFinancialReport(
      [
        {
          slot_id: 'p:0:HotelResearchMember',
          financials: { scope: 'hotel', estimated_cost: 6000, marginal_utility: 0.8 },
        },
        {
          slot_id: 'p:1:FlightResearchMember',
          financials: { scope: 'flight', estimated_cost: 5000, marginal_utility: 0.2 },
        },
      ],
      { total_user_budget: 10000, buckets: buildResearchBudgetBucketsFromTotal(10000) },
    );
    expect(report.total_estimated_cost).toBe(11000);
    expect(report.total_user_budget).toBe(10000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.code).toBe('BUDGET_OVERRUN_ALERT');
    expect(alerts[0]!.overrun_ratio).toBeCloseTo(0.1, 5);
    expect(alerts[0]!.high_marginal_utility_contributors[0]!.scope).toBe('hotel');
  });

  it('does not alert without trip budget', () => {
    const { alerts } = accumulateResearchFinancialReport([
      { financials: { scope: 'hotel', estimated_cost: 9000, marginal_utility: 0.5 } },
    ]);
    expect(alerts).toHaveLength(0);
  });
});
