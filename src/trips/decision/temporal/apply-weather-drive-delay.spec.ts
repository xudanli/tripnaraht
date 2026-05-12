import { applyWeatherDriveDelayAndEmitDrifts } from './apply-weather-drive-delay';
import type { TripPlan } from '../plan-model';

describe('applyWeatherDriveDelayAndEmitDrifts', () => {
  it('emits PROPAGATE_SEQUENCE drift and TIMELINE_FOLLOW edges', () => {
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
              id: 's1',
              time: '09:00',
              endTime: '10:00',
              title: 'Drive to Vik',
              type: 'transport',
            },
            {
              id: 's2',
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
    expect(out.constraintEdges.some(e => e.kind === 'TIMELINE_FOLLOW')).toBe(true);
    expect(out.drifts.some(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE')).toBe(true);
    expect(plan.days[0].timeSlots[0].endTime).not.toBe('10:00');
  });
});
