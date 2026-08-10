import {
  compactPoiPlanningSliceForOutcome,
  recordPoiPlanningOutcomeAfterSelection,
} from './poi-planning-outcome.runner';

describe('poi-planning-outcome.runner', () => {
  it('compacts slice fields', () => {
    expect(compactPoiPlanningSliceForOutcome(undefined)).toBeUndefined();
    expect(
      compactPoiPlanningSliceForOutcome({
        routeIntent: { regionId: 'IS' },
        schedulePlan: { feasibility: 'ok' },
        resolution: 'ok',
        appliedBackoffSteps: ['a'],
        budgetGateApplied: true,
      } as any),
    ).toEqual({
      regionId: 'IS',
      feasibility: 'ok',
      resolution: 'ok',
      appliedBackoffSteps: ['a'],
      budgetGateApplied: true,
    });
  });

  it('writes poiSelection outcome into metadata', () => {
    const state = { metadata: {} } as any;
    recordPoiPlanningOutcomeAfterSelection(state, undefined, []);
    expect(state.metadata.poiPlanningOutcome).toBeDefined();
    expect(state.metadata.poiPlanningOutcome.poiSelection).toBeDefined();
  });
});
