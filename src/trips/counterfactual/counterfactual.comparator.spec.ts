import { ConstraintStateStore } from '../stream/constraint-state.store';
import { compareCounterfactuals } from './counterfactual.comparator';
import type { CounterfactualResult } from './counterfactual.simulator';

function result(partial: Partial<CounterfactualResult>): CounterfactualResult {
  return {
    simulatedPlan: { version: '1', createdAt: 't', days: [] },
    diff: { changedSlotIds: [], touchedDayDates: [] },
    costDelta: { time: 0, risk: 0, distance: 0 },
    feasibleSlots: 0,
    patchedConstraintPreview: new ConstraintStateStore(),
    ...partial,
  };
}

describe('compareCounterfactuals', () => {
  it('recommends switch when simulated time cost is lower', () => {
    const cmp = compareCounterfactuals(
      result({ costDelta: { time: 120, risk: 0.5, distance: 0 } }),
      result({ costDelta: { time: 60, risk: 0.4, distance: 0 }, feasibleSlots: 3 }),
    );
    expect(cmp.better).toBe(true);
    expect(cmp.recommendation).toBe('Switch to alternative plan');
    expect(cmp.delta.timeSaved).toBe(60);
  });

  it('recommends keep when simulated time is not better', () => {
    const cmp = compareCounterfactuals(
      result({ costDelta: { time: 30, risk: 0.2, distance: 0 }, feasibleSlots: 2 }),
      result({ costDelta: { time: 90, risk: 0.3, distance: 0 }, feasibleSlots: 2 }),
    );
    expect(cmp.better).toBe(false);
    expect(cmp.recommendation).toBe('Keep current plan');
  });
});
