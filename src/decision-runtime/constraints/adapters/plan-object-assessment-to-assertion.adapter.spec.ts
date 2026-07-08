import {
  planObjectAssessmentToAssertion,
  planObjectProjectionToAssertions,
} from './plan-object-assessment-to-assertion.adapter';
import type { PlanObjectProjectionView } from '../../plan-objects/contracts/plan-object.types';

describe('plan-object-assessment-to-assertion.adapter', () => {
  it('CAS-040: converts WARNING assessments to gateway assertions with planObjectIds', () => {
    const assertion = planObjectAssessmentToAssertion(
      'trip-1',
      {
        kind: 'MEAL_WINDOW_VS_ARRIVAL',
        severity: 'WARNING',
        planObjectId: 'po_day-1_meal_window_policy',
        message: '预计景区 A 结束于 12:45，晚于午餐窗 12:00',
        semanticKey: 'plan_object_meal_late_arrival_po_day-1_meal_window_policy',
        details: { dayNumber: 1 },
      },
      'day-1',
    );
    expect(assertion?.status).toBe('WARNING');
    expect(assertion?.scope.planObjectIds).toEqual(['po_day-1_meal_window_policy']);
    expect(assertion?.evaluator.engine).toBe('plan-object-evaluator');
  });

  it('CAS-041: skips INFO assessments', () => {
    const assertion = planObjectAssessmentToAssertion('trip-1', {
      kind: 'STAY_LINKAGE',
      severity: 'INFO',
      message: 'info only',
      semanticKey: 'plan_object_stay_info',
    });
    expect(assertion).toBeNull();
  });

  it('CAS-042: flattens projection days into assertions', () => {
    const projection: PlanObjectProjectionView = {
      schemaId: 'tripnara.plan_object_projection@v1',
      tripId: 'trip-1',
      generatedAt: '2026-07-03T00:00:00.000Z',
      lunchStrategy: 'balanced',
      days: [
        {
          dayId: 'day-1',
          dayNumber: 1,
          date: '2026-07-10',
          objects: [],
          assessments: [
            {
              kind: 'TRANSFER_DAILY_LOAD',
              severity: 'BLOCK',
              message: 'overload',
              semanticKey: 'plan_object_transfer_load_day_1',
              details: { dayNumber: 1 },
            },
          ],
        },
      ],
      summary: { totalObjects: 0, byType: {}, assessmentCount: 1 },
    };
    const assertions = planObjectProjectionToAssertions('trip-1', projection);
    expect(assertions).toHaveLength(1);
    expect(assertions[0].status).toBe('BLOCK');
  });
});
