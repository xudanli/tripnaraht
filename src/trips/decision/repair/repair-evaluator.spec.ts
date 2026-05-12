import { evaluateMinimalRepairs } from './repair-evaluator';
import type { TripPlan } from '../plan-model';

describe('evaluateMinimalRepairs', () => {
  it('returns empty when no pressure signals', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
    };
    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
    });
    expect(out.repairs).toHaveLength(0);
    expect(out.suggestReevaluateExecutionQuality).toBe(false);
  });

  it('proposes MOVE_SLOT_EARLIER when daylightFeasibility lists after-dusk slots', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 'drive',
              time: '16:00',
              endTime: '17:30',
              title: 'Drive',
              type: 'transport',
            },
          ],
        },
      ],
    };

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      daylightFeasibility: {
        latitudeDeg: 64,
        longitudeDeg: -22,
        slotsEndingAfterCivilDusk: ['drive'],
        slotsStartingBeforeCivilDawn: [],
        violationCount: 1,
      },
    });

    expect(out.repairs.some(r => r.action === 'MOVE_SLOT_EARLIER')).toBe(true);
    expect(out.suggestReevaluateExecutionQuality).toBe(true);
  });

  it('proposes COMPRESS_STOP on optional slots under SEQUENCE delay pressure', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          weatherExecution: { executionState: 'DEGRADED' },
          timeSlots: [
            {
              id: 'opt',
              time: '11:00',
              endTime: '12:00',
              title: 'Photo stop',
              type: 'sightseeing',
              priorityTag: 'optional',
            },
          ],
        },
      ],
    };

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [
        {
          id: 'd1',
          date: '2026-06-01',
          sourceSlotId: 'x',
          deltaMinutes: 40,
          confidence: 0.8,
          propagationPolicy: 'PROPAGATE_SEQUENCE',
          cause: { kind: 'WEATHER_EXECUTION_QUALITY' },
        },
      ],
    });

    expect(out.repairs.some(r => r.action === 'COMPRESS_STOP')).toBe(true);
  });

  it('proposes EARLY_DEPARTURE and next-day MOVE_SLOT_EARLIER when PROPAGATE_CROSS_DAY drift exists', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'tail',
              time: '18:00',
              endTime: '19:00',
              title: 'Last drive',
              type: 'transport',
            },
          ],
        },
        {
          day: 2,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'morning',
              time: '08:00',
              endTime: '09:00',
              title: 'Breakfast',
              type: 'food',
            },
          ],
        },
      ],
    };

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [
        {
          id: 'drift_cross_x',
          date: '2026-06-02',
          sourceSlotId: 'tail',
          deltaMinutes: 40,
          confidence: 0.7,
          propagationPolicy: 'PROPAGATE_CROSS_DAY',
          cause: { kind: 'CROSS_DAY_SEQUENCE_SPILLOVER' },
        },
      ],
    });

    expect(out.repairs.some(r => r.action === 'EARLY_DEPARTURE')).toBe(true);
    expect(
      out.repairs.some(
        r =>
          r.action === 'MOVE_SLOT_EARLIER' && r.targetSlotIds.includes('morning'),
      ),
    ).toBe(true);
    expect(out.suggestReevaluateExecutionQuality).toBe(true);
  });

  it('proposes DELAY_CHECKIN when hotel arrival is after hotelCheckinLatest', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-08-01',
          timeSlots: [
            {
              id: 'drive_in',
              time: '21:00',
              endTime: '22:30',
              title: 'Drive to hotel',
              type: 'transport',
            },
            {
              id: 'hotel1',
              time: '23:30',
              endTime: '23:59',
              title: 'Check-in',
              type: 'hotel',
            },
          ],
        },
      ],
    };

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      policies: {
        microRepair: { hotelCheckinLatest: '23:00' },
      } as import('../world-model').TripWorldState['policies'],
    });

    expect(out.repairs.some(r => r.action === 'DELAY_CHECKIN')).toBe(true);
    expect(
      out.repairs.some(
        r =>
          r.action === 'MOVE_SLOT_EARLIER' &&
          r.targetSlotIds.includes('drive_in'),
      ),
    ).toBe(true);
  });
});
