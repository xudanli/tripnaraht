import { planDiffToPlanOperations } from './execution-risk-plan-diff-to-operations.util';

describe('execution-risk-plan-diff-to-operations.util', () => {
  it('maps modified activities to SHIFT_TIME operations', () => {
    const ops = planDiffToPlanOperations({
      beforePlanVersionId: 'pv_before',
      afterPlanVersionId: 'pv_after',
      addedActivities: [],
      removedActivities: [],
      modifiedActivities: [
        {
          before: { activityId: 'act-1', type: 'ACTIVITY', name: 'Glacier hike' },
          after: { activityId: 'act-1', type: 'ACTIVITY', name: 'Short glacier hike', durationMinutes: 90 },
        },
      ],
      unchangedActivityIds: [],
      timeDeltaMinutes: -30,
    });

    expect(ops).toHaveLength(1);
    expect(ops[0]?.kind).toBe('SHIFT_TIME');
    expect(ops[0]?.targetRefs[0]?.id).toBe('act-1');
    expect(ops[0]?.parameters.itineraryItemId).toBe('act-1');
  });
});
