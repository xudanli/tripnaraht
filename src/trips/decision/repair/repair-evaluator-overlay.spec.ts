import { evaluateMinimalRepairs } from './repair-evaluator';
import type { TripPlan } from '../plan-model';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../../execution-overlay/execution-overlay-frame.types';

function baseFrame(legId: string, partial: Partial<ExecutionOverlayFrame>): ExecutionOverlayFrame {
  return {
    schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legId,
    route: {
      legId,
      terrainDifficulty: 'LOW',
      weatherExposure: {},
      roadAccessibility: { fRoad: false },
      executionReliability: 0.8,
      estimatedDelayFactor: 1.4,
      executionState: 'DEGRADED',
    },
    temporal: {
      driftMinutes: 0,
      crossDayRisk: 0,
      daylightViolation: false,
      unifiedDelayMinutes: 0,
    },
    weather: { severity: 'MEDIUM', delayFactor: 1.4 },
    road: { blocked: false, fRoadConstraint: false },
    repair: { recommended: false },
    finalExecutionState: 'DEGRADED',
    unifiedDelayMinutes: 0,
    reliabilityScore: 0.7,
    ...partial,
  };
}

describe('evaluateMinimalRepairs overlay-only (P5-1)', () => {
  it('ignores plan.weatherExecution when frames supplied — uses overlay pressure only', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          weatherExecution: { executionState: 'EXECUTABLE' },
          timeSlots: [
            {
              id: 'drive-leg',
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
            {
              id: 'opt',
              time: '14:00',
              title: 'Stop',
              type: 'sightseeing',
              priorityTag: 'optional',
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      baseFrame('drive-leg', {
        temporal: {
          driftMinutes: 40,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 40,
        },
        unifiedDelayMinutes: 40,
        finalExecutionState: 'DEGRADED',
      }),
    ];

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      executionOverlayFrames: frames,
      policies: {},
    });

    expect(out.repairs.some(r => r.metadata?.source === 'EXECUTION_OVERLAY')).toBe(true);
    expect(out.repairs.some(r => r.action === 'COMPRESS_STOP')).toBe(true);
  });

  it('does not use daylightFeasibility list when overlay frames drive daylight repairs', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-x',
              time: '16:00',
              title: 'Drive',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 45,
              },
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      baseFrame('slot-x', {
        temporal: { driftMinutes: 0, crossDayRisk: 0, daylightViolation: true },
        finalExecutionState: 'HIGH_RISK',
      }),
    ];

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      executionOverlayFrames: frames,
      daylightFeasibility: {
        latitudeDeg: 64,
        longitudeDeg: -22,
        slotsEndingAfterCivilDusk: [],
        slotsStartingBeforeCivilDawn: [],
        violationCount: 0,
      },
    });

    expect(out.repairs.some(r => r.action === 'MOVE_SLOT_EARLIER')).toBe(true);
    expect(out.repairs.every(r => r.metadata?.source !== 'DAYLIGHT_FEASIBILITY')).toBe(true);
  });

  it('does not emit booking or aurora repairs when overlay frames present — annotation-only domains', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-02',
          timeSlots: [
            {
              id: 'hotel_a',
              time: '23:30',
              title: 'Hotel',
              type: 'hotel',
            },
            {
              id: 'aurora_slot',
              time: '22:00',
              title: 'Aurora',
              type: 'nature',
              semanticTags: ['aurora_night'],
              priorityTag: 'optional',
            },
          ],
        },
      ],
    };

    const frames: ExecutionOverlayFrame[] = [
      baseFrame('hotel_a', {
        temporal: {
          driftMinutes: 0,
          crossDayRisk: 0,
          daylightViolation: false,
          unifiedDelayMinutes: 0,
        },
        unifiedDelayMinutes: 0,
        finalExecutionState: 'EXECUTABLE',
      }),
    ];

    const out = evaluateMinimalRepairs({
      plan,
      timeDrifts: [],
      executionOverlayFrames: frames,
      policies: { microRepair: { hotelCheckinLatest: '21:00' } },
      nightObservationFeasibility: {
        infeasibleAuroraSlotIds: ['aurora_slot'],
        blockedObservationDates: ['2026-06-02'],
        notes: [],
      },
    });

    expect(out.repairs.every(r => r.metadata?.domain !== 'BOOKING')).toBe(true);
    expect(out.repairs.every(r => r.metadata?.domain !== 'AURORA')).toBe(true);
  });
});
