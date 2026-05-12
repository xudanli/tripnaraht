import type { TripPlan } from '../decision/plan-model';
import type { TripWorldState } from '../decision/world-model';
import { TRAVEL_TIME_ONTOLOGY_SCHEMA } from '../decision/travel-time-ontology/travel-time-ontology.types';
import { REALITY_SNAPSHOT_SCHEMA_V0 } from './reality-snapshot.types';
import {
  aggregatePlanTravelTimeShadow,
  buildShadowRealitySnapshotV0,
  computeRealitySnapshotId,
} from './build-shadow-reality-snapshot-v0';

describe('buildShadowRealitySnapshotV0', () => {
  it('builds snapshot with unified layers and snapshot_id', () => {
    const state: TripWorldState = {
      context: {
        destination: 'IS',
        startDate: '2026-06-01',
        durationDays: 1,
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
      },
      candidatesByDate: {
        '2026-06-01': [
          {
            id: 'h1',
            name: { en: 'H' },
            type: 'hotel',
            durationMin: 0,
            supplySnapshot: undefined,
          },
        ],
      },
      signals: {
        lastUpdatedAt: '2026-05-01T10:00:00.000Z',
        weatherByDate: {
          '2026-06-01': { violation: 'NONE', executionState: 'EXECUTABLE' } as any,
        },
      },
    };

    const snap = buildShadowRealitySnapshotV0(state, { decisionRunId: 'run_1', traceRequestId: 'tr_1' });
    expect(snap.schema).toBe(REALITY_SNAPSHOT_SCHEMA_V0);
    expect(snap.domain.region).toBe('iceland');
    expect(snap.layers.weather?.confidence).toBeGreaterThan(0.5);
    expect(snap.consistency).toBeDefined();
    expect(snap.validity?.status).toBeDefined();
    expect(snap.snapshot_id).toMatch(/^rs_/);
  });

  it('computeRealitySnapshotId is stable for same inputs', () => {
    const a = computeRealitySnapshotId('2026-01-01T00:00:00Z', 't1', 'r1');
    const b = computeRealitySnapshotId('2026-01-01T00:00:00Z', 't1', 'r1');
    expect(a).toBe(b);
  });

  it('aggregatePlanTravelTimeShadow counts drive legs with timeEstimate', () => {
    const plan: TripPlan = {
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 's1',
              time: '09:00',
              title: 'A',
              type: 'sightseeing',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -21 },
                to: { lat: 64.1, lng: -21.1 },
                durationMin: 30,
                timeEstimate: {
                  schema: TRAVEL_TIME_ONTOLOGY_SCHEMA,
                  pointEstimateMinutes: 30,
                  provenance: 'HEURISTIC_SPEED_MODEL',
                  inputsResolved: {},
                  factors: {},
                  degradedWorldModel: true,
                } as any,
              },
            },
          ],
        },
      ],
    };
    const agg = aggregatePlanTravelTimeShadow(plan);
    expect(agg.drive_legs).toBe(1);
    expect(agg.legs_with_time_ontology).toBe(1);
    expect(agg.degraded_world_model_legs).toBe(1);
  });
});
