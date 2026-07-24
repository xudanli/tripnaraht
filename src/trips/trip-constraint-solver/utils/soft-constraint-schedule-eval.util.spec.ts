import {
  buildSoftScheduleEvalContext,
  evaluateSoftConstraintsOnSchedule,
} from './soft-constraint-schedule-eval.util';
import type { TripConstraint } from '../types/trip-constraint.types';

function softConstraint(
  templateId: string,
  overrides?: Partial<TripConstraint>,
): TripConstraint {
  return {
    id: `c_tpl_${templateId}`,
    tripId: 't1',
    name: templateId,
    category: 'ACTIVITY',
    type: 'SOFT',
    status: 'ACTIVE',
    scope: { type: 'TRIP' },
    operator: 'CUSTOM',
    value: { templateId, maxCount: 3 },
    priority: 5,
    allowRelaxation: true,
    locked: false,
    source: { type: 'USER', templateId },
    visibility: 'TEAM',
    createdBy: 'u1',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('soft-constraint-schedule-eval.util', () => {
  it('flags max_major_pois_per_day when day exceeds limit', () => {
    const ctx = buildSoftScheduleEvalContext({
      TripDay: [
        {
          date: new Date('2026-08-01'),
          ItineraryItem: [
            { id: 'a', type: 'ATTRACTION', startTime: new Date('2026-08-01T09:00:00Z') },
            { id: 'b', type: 'ATTRACTION', startTime: new Date('2026-08-01T11:00:00Z') },
            { id: 'c', type: 'ATTRACTION', startTime: new Date('2026-08-01T13:00:00Z') },
            { id: 'd', type: 'ATTRACTION', startTime: new Date('2026-08-01T15:00:00Z') },
          ],
        },
      ],
    });
    const violations = evaluateSoftConstraintsOnSchedule(
      [softConstraint('max_major_pois_per_day', { value: { templateId: 'max_major_pois_per_day', maxCount: 3 } })],
      ctx,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.dayNumber).toBe(1);
  });

  it('flags avoid_early when first item starts too early', () => {
    const ctx = buildSoftScheduleEvalContext({
      TripDay: [
        {
          date: new Date('2026-08-01T12:00:00Z'),
          ItineraryItem: [
            {
              id: 'a',
              type: 'ATTRACTION',
              startTime: new Date('2026-08-01T06:30:00Z'),
              endTime: new Date('2026-08-01T07:30:00Z'),
            },
          ],
        },
      ],
    });
    const violations = evaluateSoftConstraintsOnSchedule(
      [
        softConstraint('avoid_early', {
          value: { templateId: 'avoid_early', earliestTime: '08:30' },
        }),
      ],
      ctx,
    );
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});
