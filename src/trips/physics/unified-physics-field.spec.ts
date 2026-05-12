import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import {
  buildLegDateIndexFromPlan,
  buildUnifiedPhysicsField,
  buildUnifiedPhysicsFieldByLegId,
  deriveUnifiedState,
} from './index';

function minimalPlanWithDrive(slotId: string): TripPlan {
  return {
    version: 't',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: slotId,
            time: '09:00',
            title: 'A',
            type: 'sightseeing',
            durationMin: 60,
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64, lng: -21 },
              to: { lat: 64.2, lng: -21.2 },
              durationMin: 45,
              distanceKm: 80,
            },
          },
        ],
      },
    ],
  };
}

describe('unified physics field (P-Next 1)', () => {
  it('buildUnifiedPhysicsField produces STABLE for clean executable overlay', () => {
    const plan = minimalPlanWithDrive('slot-a');
    const frames = buildExecutionOverlay({
      plan,
      weatherByDate: {},
    });
    const legDates = buildLegDateIndexFromPlan(plan);
    const fields = buildUnifiedPhysicsField({
      executionOverlayFrames: frames,
      legDateByLegId: legDates,
    });
    expect(fields).toHaveLength(1);
    expect(fields[0]?.derived).toBe('STABLE');
    expect(fields[0]?.constraints.blocked).toBe(false);
  });

  it('buildUnifiedPhysicsFieldByLegId indexes by leg id', () => {
    const plan = minimalPlanWithDrive('slot-a');
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const idx = buildUnifiedPhysicsFieldByLegId(plan, frames);
    expect(idx['slot-a']).toBeDefined();
    expect(idx['slot-a']?.legId).toBe('slot-a');
  });

  it('deriveUnifiedState returns IMPASSABLE when scalar gate triggers', () => {
    expect(
      deriveUnifiedState(true, 0.9, 0.2, 0.9, 0.1, false),
    ).toBe('IMPASSABLE');
    expect(
      deriveUnifiedState(false, 0.9, 0.2, 0.9, 0.1, true),
    ).toBe('IMPASSABLE');
  });
});
