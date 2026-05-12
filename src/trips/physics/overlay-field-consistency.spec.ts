import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import {
  assertOverlayFieldConsistency,
  buildUnifiedPhysicsFieldByLegId,
  checkOverlayFieldConsistency,
} from './index';

function minimalDrivePlan(): TripPlan {
  return {
    version: 't',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'leg1',
            time: '09:00',
            title: 'X',
            type: 'sightseeing',
            durationMin: 60,
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64, lng: -21 },
              to: { lat: 64.1, lng: -21.1 },
              durationMin: 40,
              distanceKm: 40,
            },
          },
        ],
      },
    ],
  };
}

describe('overlay ↔ unified physics consistency (P-Next 1.3)', () => {
  it('passes when overlay and field are compiled together', () => {
    const plan = minimalDrivePlan();
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const byLeg = buildUnifiedPhysicsFieldByLegId(plan, frames);
    const fields = Object.values(byLeg).filter((x): x is NonNullable<typeof x> => x != null);
    expect(() => assertOverlayFieldConsistency(frames, fields)).not.toThrow();
    expect(checkOverlayFieldConsistency(frames, fields)).toHaveLength(0);
  });
});
