import {
  assertCandidateWithinDecisionScope,
  assertSharedSnapshotId,
} from '../contracts/decision-scope.types';
import { buildWindDecisionScope } from '../builders/build-wind-decision-scope';
import type { TravelWorldStateSnapshot } from '../contracts/world-state-snapshot';

function stubSnapshot(overrides?: Partial<TravelWorldStateSnapshot>): TravelWorldStateSnapshot {
  return {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId: 'ws_wind_1',
    tripId: 'trip_is_south_coast_demo',
    revision: '1',
    createdAt: '2026-07-17T09:00:00.000Z',
    weather: [{ date: '2026-07-17', windSpeedMs: 22, alertLevel: 'ORANGE' }],
    roads: [{ roadId: '1', segmentId: 'seg_south', status: 'OPEN' }],
    hazards: [],
    ferries: [],
    poiStates: [],
    travelMatrix: { matrixId: 'm1', entries: [] },
    completeness: {
      weather: 'PARTIAL',
      roads: 'PARTIAL',
      hazards: 'PARTIAL',
      ferries: 'MISSING',
      openingHours: 'PARTIAL',
    },
    sourceVersions: [],
    vehicle: { vehicleClass: 'HIGH_ROOF_CAMPER', highRoof: true },
    inferred: {
      missProbability: 0.71,
      interventionDeadline: '2026-07-17T12:35:00.000Z',
      estimatedArrival: '2026-07-17T15:28:00.000Z',
      confidence: 0.82,
      evidence: ['fact:weather.gust_mps'],
    },
    ...overrides,
  };
}

describe('DecisionScope + shared snapshot (P3)', () => {
  it('buildWindDecisionScope binds snapshotId', () => {
    const snap = stubSnapshot();
    const scope = buildWindDecisionScope({
      snapshot: snap,
      activityId: 'activity:glacier',
      segmentId: 'seg_south',
    });
    expect(scope.snapshotId).toBe('ws_wind_1');
    expect(scope.allowedActions).toContain('DROP_STOP');
    expect(scope.forbiddenActions).toContain('DIRECT_SET_EFFECTIVE');
  });

  it('rejects out-of-scope mutation', () => {
    const scope = buildWindDecisionScope({ snapshot: stubSnapshot() });
    const bad = assertCandidateWithinDecisionScope(scope, {
      actionType: 'MOVE_DAY',
      targetObjectIds: ['activity:checkin'],
    });
    expect(bad.ok).toBe(false);
  });

  it('allows in-scope DROP_STOP', () => {
    const scope = buildWindDecisionScope({
      snapshot: stubSnapshot(),
      activityId: 'activity:checkin',
    });
    const ok = assertCandidateWithinDecisionScope(scope, {
      actionType: 'DROP_STOP',
      targetObjectIds: ['stop:mid_waterfall'],
    });
    expect(ok).toEqual({ ok: true });
  });

  it('assertSharedSnapshotId fails on mismatch', () => {
    expect(() =>
      assertSharedSnapshotId('ws_wind_1', [
        { name: 'decision', snapshotId: 'ws_wind_1' },
        { name: 'solver', snapshotId: 'ws_other' },
      ]),
    ).toThrow(/snapshot mismatch/);
  });
});
