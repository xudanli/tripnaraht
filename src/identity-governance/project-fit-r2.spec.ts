import { evaluateProjectFit } from './utils/project-fit-evaluation.util';
import { buildSupplyContext } from './utils/supply-context.util';

describe('project-fit R2 supply-aware team impact', () => {
  const listing = {
    budgetMinCents: 500000,
    budgetMaxCents: 800000,
    slotsTotal: 6,
    slotsFilled: 4,
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-07'),
  };

  it('raises team impact under supply pressure with low budget vs queue average', () => {
    const supplyContext = buildSupplyContext({
      slotsTotal: 6,
      slotsFilled: 4,
      budgetMinCents: 500000,
      budgetMaxCents: 800000,
      pendingApplications: 4,
      pendingBudgetCents: [700000, 680000, 720000],
    });

    const result = evaluateProjectFit({
      rules: [],
      answers: {
        budget_cents: 400000,
        pace_acceptance: 5,
        risk_acceptance: 4,
        accommodation_shared: true,
      },
      listing,
      supplyContext,
    });

    expect(result.teamImpactResult.factors).toContain('supply_pressure');
    expect(result.teamImpactResult.factors).toContain('budget_below_queue_average');
    expect(['MEDIUM', 'HIGH']).toContain(result.teamImpactResult.level);
    expect(result.overallResult).not.toBe('NOT_RECOMMENDED');
  });

  it('builds supply context with price per slot', () => {
    const ctx = buildSupplyContext({
      slotsTotal: 5,
      slotsFilled: 2,
      budgetMinCents: 500000,
      budgetMaxCents: null,
      pendingApplications: 2,
      pendingBudgetCents: [600000],
    });
    expect(ctx.slotsRemaining).toBe(3);
    expect(ctx.pricePerSlotCents).toBe(100000);
    expect(ctx.avgPendingBudgetCents).toBe(600000);
  });
});
