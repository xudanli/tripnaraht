import { deriveTemporalProjectionFromFrame } from './derive-temporal-from-overlay';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from './execution-overlay-frame.types';

describe('deriveTemporalProjectionFromFrame', () => {
  it('projects severity from overlay fields only', () => {
    const frame: ExecutionOverlayFrame = {
      schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
      legId: 'x',
      route: {
        legId: 'x',
        terrainDifficulty: 'LOW',
        weatherExposure: {},
        roadAccessibility: { fRoad: false },
        executionReliability: 0.5,
        estimatedDelayFactor: 1,
        executionState: 'HIGH_RISK',
      },
      temporal: {
        driftMinutes: 10,
        crossDayRisk: 0.5,
        daylightViolation: false,
        unifiedDelayMinutes: 30,
      },
      weather: { severity: 'LOW', delayFactor: 1 },
      road: { blocked: false, fRoadConstraint: false },
      repair: { recommended: false },
      finalExecutionState: 'HIGH_RISK',
      unifiedDelayMinutes: 30,
      reliabilityScore: 0.55,
    };
    const p = deriveTemporalProjectionFromFrame(frame);
    expect(p.driftMinutes).toBe(10);
    expect(p.crossDayRisk).toBe(0.5);
    expect(p.temporalSeverity).toBe('HIGH');
  });
});
