import { deriveOvernightFromOverlay } from './derive-overnight-from-overlay';
import type { TripPlan } from '../plan-model';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';

function frame(
  legId: string,
  partial: Partial<ExecutionOverlayFrame>,
): ExecutionOverlayFrame {
  return {
    schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legId,
    route: {
      legId,
      terrainDifficulty: 'LOW',
      weatherExposure: {},
      roadAccessibility: { fRoad: false },
      executionReliability: 0.6,
      estimatedDelayFactor: 1.2,
      executionState: 'HIGH_RISK',
    },
    temporal: {
      driftMinutes: 0,
      crossDayRisk: 0,
      daylightViolation: false,
      unifiedDelayMinutes: 0,
    },
    weather: { severity: 'LOW', delayFactor: 1 },
    road: { blocked: false, fRoadConstraint: false },
    repair: { recommended: false },
    finalExecutionState: 'EXECUTABLE',
    unifiedDelayMinutes: 0,
    reliabilityScore: 0.8,
    ...partial,
  };
}

describe('deriveOvernightFromOverlay', () => {
  it('aggregates drift + crossDay proxy into temporalStress for restructuringRecommended', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-a',
              time: '10:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 60,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      frame('leg-a', {
        temporal: {
          driftMinutes: 25,
          crossDayRisk: 0.4,
          daylightViolation: false,
          unifiedDelayMinutes: 50,
        },
        finalExecutionState: 'HIGH_RISK',
        unifiedDelayMinutes: 50,
      }),
    ];

    const pressures = deriveOvernightFromOverlay(plan, frames);
    const p = pressures.find(x => x.date === '2026-06-01');
    expect(p?.unsafeLegIds).toContain('leg-a');
    expect(p?.daylightCollapseSeverity).toBe('MEDIUM');
    expect(p?.downstreamShiftMinutes).toBe(50);
    expect((p?.downstreamShiftMinutes ?? 0) + (p?.crossDaySpillMinutes ?? 0)).toBeGreaterThanOrEqual(
      40,
    );
    expect(p?.restructuringRecommended).toBe(true);
  });

  it('returns empty array when frames empty', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
    };
    expect(deriveOvernightFromOverlay(plan, [])).toEqual([]);
  });
});
