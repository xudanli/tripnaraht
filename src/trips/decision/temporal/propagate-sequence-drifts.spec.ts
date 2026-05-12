import { applyWeatherDriveDelayAndEmitDrifts } from './apply-weather-drive-delay';
import { propagateSequenceDriftsToDownstreamSlots } from './propagate-sequence-drifts';
import type { TripPlan } from '../plan-model';

describe('propagateSequenceDriftsToDownstreamSlots', () => {
  it('shifts downstream slot start/end by cumulative upstream SEQUENCE drift', () => {
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
              delayFactor: 1.15,
              visibilityPenalty: 0.1,
              fatigueCost: 0.05,
              riskBudget: 0.65,
            },
          },
          timeSlots: [
            {
              id: 'drive',
              time: '09:00',
              endTime: '10:00',
              title: 'Drive',
              type: 'transport',
            },
            {
              id: 'sight',
              time: '10:30',
              endTime: '12:00',
              title: 'Sightseeing',
              type: 'sightseeing',
            },
          ],
        },
      ],
    };

    const out = applyWeatherDriveDelayAndEmitDrifts(plan);
    plan.temporal = {
      timeDrifts: out.drifts,
      constraintEdges: out.constraintEdges,
      emittedAt: new Date().toISOString(),
    };
    const seq = propagateSequenceDriftsToDownstreamSlots(plan);
    expect(seq.shiftedSlotIds).toContain('sight');
    const sight = plan.days[0].timeSlots.find(s => s.id === 'sight')!;
    expect(sight.time > '10:30').toBe(true);
  });
});
