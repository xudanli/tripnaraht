import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';
import { computePartialReplanScope } from './compute-partial-replan-scope.util';

describe('computePartialReplanScope (Iceland D3 card swap)', () => {
  const replaceD3: PlanDeltaIR = {
    op: 'REPLACE',
    target: { type: 'POI', dayIndex: 2, id: 'poi_reynisfjara' },
    payload: { query: 'Sólheimasandur plane wreck', patchMeta: {} },
  };

  it('freezes days before anchor and after forward cone for 7-day trip', () => {
    const scope = computePartialReplanScope([replaceD3], { totalDays: 7, forwardConeDays: 1 });
    expect(scope).not.toBeNull();
    expect(scope!.anchorDayIndex).toBe(2);
    expect(scope!.replanDayRange).toEqual({ from: 2, to: 3 });
    expect(scope!.frozenDayIndices).toEqual(expect.arrayContaining([0, 1, 4, 5, 6]));
    expect(scope!.estimatedLatencyMs).toBeLessThanOrEqual(500);
    expect(scope!.reason).toContain('REPLACE');
  });

  it('returns null when no POI delta with dayIndex', () => {
    expect(
      computePartialReplanScope([
        {
          op: 'REPLACE',
          target: { type: 'HOTEL', dayIndex: 1 },
          payload: {},
        },
      ]),
    ).toBeNull();
  });
});
