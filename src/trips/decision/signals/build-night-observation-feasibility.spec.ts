import { buildNightObservationFeasibilitySummary } from './build-night-observation-feasibility';
import type { AuroraNightObservationSignal } from './aurora-night-signals.types';
import type { TripPlan } from '../plan-model';

describe('buildNightObservationFeasibilitySummary', () => {
  it('marks aurora-tagged night slots when observation is blocked', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-01-10',
          timeSlots: [
            {
              id: 's1',
              time: '22:00',
              endTime: '23:30',
              title: '追极光',
              type: 'nature',
              semanticTags: ['aurora_night'],
              priorityTag: 'optional',
            },
          ],
        },
      ],
    };

    const auroraByDate: Partial<Record<string, AuroraNightObservationSignal>> = {
      '2026-01-10': {
        kpIndex: 2,
        cloudCoveragePct: 90,
        visibility: 'none',
        observationFeasibility: 'blocked',
        updatedAt: new Date().toISOString(),
      },
    };

    const summary = buildNightObservationFeasibilitySummary(plan, auroraByDate);
    expect(summary.blockedObservationDates).toContain('2026-01-10');
    expect(summary.infeasibleAuroraSlotIds).toContain('s1');
  });

  it('does not flag slots when observation is feasible', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-01-11',
          timeSlots: [
            {
              id: 's2',
              time: '22:00',
              title: '追极光',
              type: 'nature',
              semanticTags: ['aurora_night'],
            },
          ],
        },
      ],
    };

    const auroraByDate: Partial<Record<string, AuroraNightObservationSignal>> = {
      '2026-01-11': {
        kpIndex: 5,
        cloudCoveragePct: 10,
        visibility: 'high',
        observationFeasibility: 'feasible',
        updatedAt: new Date().toISOString(),
      },
    };

    const summary = buildNightObservationFeasibilitySummary(plan, auroraByDate);
    expect(summary.infeasibleAuroraSlotIds).toHaveLength(0);
    expect(summary.blockedObservationDates).toHaveLength(0);
  });
});
