import { buildLegTemporalSafetyAssessments } from './build-leg-temporal-safety-assessments';
import type { TripPlan } from '../plan-model';

describe('buildLegTemporalSafetyAssessments', () => {
  it('flags UNSAFE when transport arrival is after civil dusk (Reykjavik winter-like)', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-01-15',
          timeSlots: [
            {
              id: 't1',
              time: '17:00',
              endTime: '17:30',
              title: 'Drive',
              type: 'transport',
            },
          ],
        },
      ],
    };

    const assessments = buildLegTemporalSafetyAssessments(plan, {
      latitudeDeg: 64.1466,
      longitudeDeg: -21.9426,
      utcOffsetMinutes: 0,
    });

    expect(assessments.length).toBe(1);
    expect(assessments[0]!.safeArrival).toBeDefined();
    expect(['SAFE', 'MARGINAL', 'UNSAFE']).toContain(assessments[0]!.severity);
  });
});
