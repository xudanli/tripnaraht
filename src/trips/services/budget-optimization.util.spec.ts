import {
  buildBudgetEvidence,
  buildOptimizationProposals,
} from './budget-optimization.util';

describe('budget-optimization.util', () => {
  it('buildBudgetEvidence includes intent and violations', () => {
    const evidence = buildBudgetEvidence({
      tripId: 'trip-1',
      estimatedCost: 12000,
      categoryBreakdown: {
        accommodation: 5000,
        transportation: 2000,
        food: 1000,
        activities: 4000,
        other: 0,
      },
      intentTotal: 10000,
      currency: 'CNY',
      violations: [
        {
          type: 'TOTAL_EXCEEDED',
          message: '超支 20%',
        },
      ],
      structureAllocations: {
        accommodation: 500,
        experience: 5000,
        transportation: 3000,
        food: 1500,
        other: 0,
      },
    });

    expect(evidence.some((e) => e.type === 'intent')).toBe(true);
    expect(evidence.some((e) => e.type === 'structure')).toBe(true);
    expect(evidence.some((e) => e.type === 'violation')).toBe(true);
  });

  it('buildOptimizationProposals binds top item for structure mismatch', () => {
    const proposals = buildOptimizationProposals({
      items: [
        {
          id: 'item-hotel',
          estimatedCost: 4200,
          actualCost: null,
          costCategory: 'ACCOMMODATION',
          type: 'REST',
          Place: { nameCN: '冰岛酒店', nameEN: null },
        },
        {
          id: 'item-bus',
          estimatedCost: 800,
          actualCost: null,
          costCategory: 'TRANSPORTATION',
          type: 'TRANSIT',
          Place: { nameCN: '巴士', nameEN: null },
        },
      ],
      violations: [
        {
          type: 'STRUCTURE_MISMATCH',
          category: 'accommodation',
          intentAmount: 500,
          estimatedAmount: 4200,
          message: '住宿偏差',
        },
      ],
      recommendations: [],
      targetSavings: 2000,
    });

    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].itemId).toBe('item-hotel');
    expect(proposals[0].id).toMatch(/^opt-/);
  });
});
