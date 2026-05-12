import { applyWeatherDriveDelayAndEmitDrifts } from './apply-weather-drive-delay';
import { buildCrossDayHandoffEdges } from './build-cross-day-edges';
import { emitCrossDayHandoffDrifts } from './emit-cross-day-handoff-drifts';
import { propagateSequenceDriftsToDownstreamSlots } from './propagate-sequence-drifts';
import { propagateCrossDayDriftsToNextDaySlots } from './propagate-cross-day-drifts';
import type { TripPlan } from '../plan-model';
import { addMinutesToIsoTime } from '../utils/weather-slot-delay.util';

describe('cross-day temporal propagation (v1)', () => {
  it('rolls SEQUENCE spill into next day first unlocked slot', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          weatherExecution: {
            executionState: 'DEGRADED',
            executionQuality: {
              safeScore: 0.7,
              delayFactor: 1.2,
              visibilityPenalty: 0.1,
              fatigueCost: 0.05,
              riskBudget: 0.65,
            },
          },
          timeSlots: [
            {
              id: 'd1',
              time: '09:00',
              endTime: '10:00',
              title: 'Drive',
              type: 'transport',
            },
            {
              id: 'sight1',
              time: '10:30',
              endTime: '12:00',
              title: 'Sightseeing',
              type: 'sightseeing',
            },
          ],
        },
        {
          day: 2,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'breakfast',
              time: '08:00',
              endTime: '09:00',
              title: 'Breakfast',
              type: 'food',
            },
            {
              id: 'd2',
              time: '10:00',
              endTime: '11:30',
              title: 'Drive',
              type: 'transport',
            },
          ],
        },
      ],
    };

    const wx = applyWeatherDriveDelayAndEmitDrifts(plan);
    plan.temporal = {
      timeDrifts: wx.drifts,
      constraintEdges: wx.constraintEdges,
      emittedAt: new Date().toISOString(),
    };

    propagateSequenceDriftsToDownstreamSlots(plan);

    const crossDrifts = emitCrossDayHandoffDrifts(plan);
    expect(crossDrifts.length).toBe(1);
    expect(crossDrifts[0].propagationPolicy).toBe('PROPAGATE_CROSS_DAY');

    plan.temporal.timeDrifts = [...plan.temporal.timeDrifts, ...crossDrifts];
    plan.temporal.constraintEdges = [
      ...plan.temporal.constraintEdges,
      ...buildCrossDayHandoffEdges(plan),
    ];

    expect(
      plan.temporal.constraintEdges.some(e => e.kind === 'CROSS_DAY_HANDOFF'),
    ).toBe(true);

    const { shiftedSlotIds } = propagateCrossDayDriftsToNextDaySlots(plan);
    expect(shiftedSlotIds).toContain('breakfast');
    expect(shiftedSlotIds).toContain('d2');

    const breakfast = plan.days[1].timeSlots.find(s => s.id === 'breakfast')!;
    const d2 = plan.days[1].timeSlots.find(s => s.id === 'd2')!;
    const deltaMin =
      crossDrifts[0].deltaMinutes;
    expect(breakfast.time > '08:00').toBe(true);
    expect(d2.time).toBe(addMinutesToIsoTime('10:00', deltaMin));
  });
});
