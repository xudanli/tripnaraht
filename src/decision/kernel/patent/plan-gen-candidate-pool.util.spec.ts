import type { DecisionState } from '../decision-state.types';
import {
  buildPatentPlanCandidatePool,
  patentCandidatesToDsoField,
} from './plan-gen-candidate-pool.util';

describe('buildPatentPlanCandidatePool', () => {
  const dso = (): DecisionState =>
    ({
      userIntent: { days: 5, budget: 20000 },
      environmentState: { weatherRisk: 0.9 },
      uncertaintyProfile: { rolloutTopK: 2, entropy01: 0.9 },
      constraints: { feasible: true, violations: [], warnings: [] },
    }) as DecisionState;

  const itinerary = {
    request_id: 'nz',
    days: Array.from({ length: 5 }, (_, i) => ({
      date: `2026-04-0${i + 1}`,
      items: [{ location_ref: { name: `Activity ${i + 1}` } }],
    })),
  };

  it('rejects hike and cruise under high day3 weather risk', () => {
    const { all } = buildPatentPlanCandidatePool(dso(), itinerary);
    const hike = all.find((c) => c.id === 'plan_hike');
    const cruise = all.find((c) => c.id === 'plan_cruise');
    expect(hike?.feasible).toBe(false);
    expect(cruise?.feasible).toBe(false);
  });

  it('retains indoor spa and museum variants as Top-2', () => {
    const result = buildPatentPlanCandidatePool(dso(), itinerary);
    expect(result.retained.length).toBe(2);
    expect(result.retained.every((c) => c.feasible)).toBe(true);
    const ids = result.retained.map((c) => c.id);
    expect(ids).toContain('plan_c_indoor_spa');
    expect(ids).toContain('plan_d_museum');
  });

  it('ranks spa above museum when beta-weighted (patent plan_C preference)', () => {
    const result = buildPatentPlanCandidatePool(dso(), itinerary, { explorationBeta: 0.4 });
    expect(result.retained[0]?.id).toBe('plan_c_indoor_spa');
  });

  it('patentCandidatesToDsoField produces audit-friendly objects', () => {
    const result = buildPatentPlanCandidatePool(dso(), itinerary);
    const field = patentCandidatesToDsoField(result);
    expect(field.length).toBe(2);
    expect(field[0]).toMatchObject({ id: expect.any(String), utility_pre: expect.any(Number), ig: expect.any(Number) });
  });
});
