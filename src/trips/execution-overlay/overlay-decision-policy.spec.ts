import {
  assertExecutionOverlayDecisionAllowed,
  isExecutionOverlayDecisionLockEnabled,
} from './overlay-decision-policy';
import type { TripPlan } from '../decision/plan-model';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from './execution-overlay-frame.types';

describe('overlay-decision-policy', () => {
  const planWithLeg: TripPlan = {
    version: '1',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-01',
        timeSlots: [
          {
            id: 'x',
            time: '09:00',
            title: 'T',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64, lng: -22 },
              to: { lat: 64.1, lng: -21.9 },
              durationMin: 10,
            },
          },
        ],
      },
    ],
  };

  const minimalFrame: ExecutionOverlayFrame = {
    schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legId: 'x',
    route: {
      legId: 'x',
      terrainDifficulty: 'LOW',
      weatherExposure: {},
      roadAccessibility: { fRoad: false },
      executionReliability: 1,
      estimatedDelayFactor: 1,
      executionState: 'EXECUTABLE',
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
    reliabilityScore: 1,
  };

  it('does not enforce when lock disabled', () => {
    expect(isExecutionOverlayDecisionLockEnabled(undefined)).toBe(false);
    expect(() =>
      assertExecutionOverlayDecisionAllowed(planWithLeg, [], undefined, 'test'),
    ).not.toThrow();
  });

  it('throws when lock on and frames empty', () => {
    expect(() =>
      assertExecutionOverlayDecisionAllowed(
        planWithLeg,
        [],
        { executionOverlayDecisionLock: true },
        'test',
      ),
    ).toThrow(/NON_OVERLAY_DECISION_FORBIDDEN/);
  });

  it('allows when lock on and frames present', () => {
    expect(() =>
      assertExecutionOverlayDecisionAllowed(
        planWithLeg,
        [minimalFrame],
        { executionOverlayDecisionLock: true },
        'test',
      ),
    ).not.toThrow();
  });
});
