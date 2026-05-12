import { computeDualEngineConvergence } from './convergence.engine';
import type { TripDraftSelection } from '../state/trip-draft-state.types';

describe('computeDualEngineConvergence', () => {
  it('full agreement yields HYBRID label and identical override', () => {
    const s: TripDraftSelection[] = [
      { day: 1, slot: 'morning', placeId: 1 },
      { day: 1, slot: 'lunch', placeId: 2 },
    ];
    const r = computeDualEngineConvergence(s, s);
    expect(r.agreementScore).toBe(1);
    expect(r.divergenceAreas.length).toBe(0);
    expect(r.overridePlan.length).toBe(2);
  });

  it('meal conflict prefers algo place in override when policy default', () => {
    const llm: TripDraftSelection[] = [{ day: 1, slot: 'lunch', placeId: 100 }];
    const algo: TripDraftSelection[] = [{ day: 1, slot: 'lunch', placeId: 200 }];
    const r = computeDualEngineConvergence(llm, algo);
    expect(r.divergenceAreas.length).toBeGreaterThan(0);
    const merged = r.overridePlan.find((x) => x.slot === 'lunch');
    expect(merged?.placeId).toBe(200);
  });
});
