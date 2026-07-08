import { buildTimelinePlanObjectsSummary } from './timeline-plan-objects.util';
import type { PlanObjectProjectionView } from '../../decision-runtime/plan-objects/contracts/plan-object.types';

describe('timeline-plan-objects.util', () => {
  it('CAS-060: builds per-day summary from projection view', () => {
    const view: PlanObjectProjectionView = {
      schemaId: 'tripnara.plan_object_projection@v1',
      tripId: 'trip-1',
      generatedAt: '2026-07-03T00:00:00.000Z',
      lunchStrategy: 'balanced',
      days: [
        {
          dayId: 'day-1',
          dayNumber: 1,
          date: '2026-07-10',
          objects: [
            {
              planObjectId: 'po_1',
              type: 'VISIT',
              dayId: 'day-1',
              dayNumber: 1,
              date: '2026-07-10',
              sequence: 1,
              status: 'PLANNED',
              source: 'itinerary_item',
            },
          ],
          assessments: [
            {
              kind: 'MEAL_WINDOW_GAP',
              severity: 'WARNING',
              message: '午餐空档不足',
              semanticKey: 'plan_object_meal_gap_day_1',
            },
          ],
        },
      ],
      summary: { totalObjects: 1, byType: { VISIT: 1 }, assessmentCount: 1 },
    };

    const summary = buildTimelinePlanObjectsSummary(view);
    expect(summary.schemaId).toBe('tripnara.timeline_plan_objects@v1');
    expect(summary.days[0].objectTypes).toEqual(['VISIT']);
    expect(summary.days[0].topAssessment?.kind).toBe('MEAL_WINDOW_GAP');
  });
});
