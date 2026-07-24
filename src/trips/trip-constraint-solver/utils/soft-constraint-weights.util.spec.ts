import { mergeSoftConstraintsIntoCompiledWeights } from './soft-constraint-weights.util';
import type { TripConstraint } from '../types/trip-constraint.types';

describe('soft-constraint-weights.util', () => {
  it('merges soft priority into compiledWeights.softPreferences and canonical', () => {
    const merged = mergeSoftConstraintsIntoCompiledWeights(
      { legacy: {}, canonical: { budget_deviation: 0.2 } },
      [
        {
          id: 'c_tpl_budget_soft',
          tripId: 't1',
          name: '控制预算',
          category: 'BUDGET',
          type: 'SOFT',
          status: 'ACTIVE',
          scope: { type: 'TRIP' },
          operator: 'CUSTOM',
          value: { templateId: 'budget_soft', intensity: 85 },
          priority: 8,
          allowRelaxation: true,
          locked: false,
          source: { type: 'USER', templateId: 'budget_soft' },
          visibility: 'TEAM',
          createdBy: 'u1',
          createdAt: '',
          updatedAt: '',
        } as TripConstraint,
      ],
    );
    expect(merged.softPreferences?.c_tpl_budget_soft).toBe(0.8);
    expect(merged.softPreferences?.budget_soft).toBe(0.8);
    expect(merged.canonical.budget_deviation).toBeGreaterThan(0.2);
  });
});
