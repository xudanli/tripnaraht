import { ConstraintChecker } from './constraint-checker';
import type { TripWorldState } from '../world-model';
import type { TripPlan } from '../plan-model';

describe('ConstraintChecker daylight signals', () => {
  const checker = new ConstraintChecker();

  it('emits warnings from signals.daylightFeasibility slot ids', async () => {
    const state = {
      context: {
        destination: 'IS',
        startDate: '2026-12-15',
        durationDays: 1,
        preferences: {
          intents: {},
          pace: 'moderate',
          riskTolerance: 'LOW',
        },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        daylightFeasibility: {
          latitudeDeg: 64.14,
          longitudeDeg: -21.94,
          slotsEndingAfterCivilDusk: ['late_drive'],
          slotsStartingBeforeCivilDawn: ['early_go'],
          violationCount: 2,
        },
      },
    } as TripWorldState;

    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 'late_drive',
              time: '16:00',
              endTime: '17:30',
              title: 'Drive',
              type: 'transport',
            },
            {
              id: 'early_go',
              time: '05:00',
              endTime: '06:00',
              title: 'Early leg',
              type: 'transport',
            },
          ],
        },
      ],
    };

    const result = await checker.checkPlan(state, plan);
    const codes = result.violations.map(v => v.code);
    expect(codes).toContain('DAYLIGHT_AFTER_CIVIL_DUSK');
    expect(codes).toContain('DAYLIGHT_BEFORE_CIVIL_DAWN');
    expect(result.violations.every(v => v.severity === 'warning')).toBe(true);
  });
});
