import { applyDaylightFeasibilityHints } from './apply-daylight-feasibility-hints';
import type { TripPlan } from '../plan-model';

describe('applyDaylightFeasibilityHints', () => {
  it('flags transport ending after civil dusk (Reykjavik winter)', () => {
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
          ],
        },
      ],
    };

    const out = applyDaylightFeasibilityHints(plan, {
      latitudeDeg: 64.1466,
      longitudeDeg: -21.9426,
      utcOffsetMinutes: 0,
    });

    expect(out.slotsEndingAfterCivilDusk).toContain('late_drive');
    expect(out.violationCount).toBeGreaterThanOrEqual(1);
    expect(
      plan.days[0].timeSlots[0].reasons?.some(r =>
        r.includes('daylight_civil_twilight_v1'),
      ),
    ).toBe(true);
  });

  it('ignores indoor-heavy types by default', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-12-15',
          timeSlots: [
            {
              id: 'museum',
              time: '16:00',
              endTime: '18:00',
              title: 'Museum',
              type: 'museum',
            },
          ],
        },
      ],
    };

    const out = applyDaylightFeasibilityHints(plan, {
      latitudeDeg: 64.1466,
      longitudeDeg: -21.9426,
    });

    expect(out.violationCount).toBe(0);
    expect(out.slotsEndingAfterCivilDusk.length).toBe(0);
  });
});
