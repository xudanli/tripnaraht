import { assertDAGCanonicalRepairInputs, assertOnlyDAGIsDecisionSource, isDAGCanonicalLockEnabled } from './dag-canonical-policy';
import type { TripPlan } from '../decision/plan-model';
import type { ExecutionTruthDAG } from './execution-truth-dag.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from '../execution-overlay/execution-overlay-frame.types';

describe('dag-canonical-policy (P8-1)', () => {
  const prev = process.env.TRIP_DAG_CANONICAL_LOCK;

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.TRIP_DAG_CANONICAL_LOCK;
    } else {
      process.env.TRIP_DAG_CANONICAL_LOCK = prev;
    }
  });

  it('isDAGCanonicalLockEnabled reads env', () => {
    process.env.TRIP_DAG_CANONICAL_LOCK = '1';
    expect(isDAGCanonicalLockEnabled({})).toBe(true);
    delete process.env.TRIP_DAG_CANONICAL_LOCK;
    expect(isDAGCanonicalLockEnabled({})).toBe(false);
  });

  it('assertOnlyDAGIsDecisionSource throws when lock on and DAG empty', () => {
    process.env.TRIP_DAG_CANONICAL_LOCK = '1';
    expect(() =>
      assertOnlyDAGIsDecisionSource({ nodes: [], edges: [] }, {}, 'test'),
    ).toThrow(/ONLY_DAG_DECISION_SOURCE/);
  });

  it('assertDAGCanonicalRepairInputs throws when overlay+travel leg but no DAG', () => {
    process.env.TRIP_DAG_CANONICAL_LOCK = '1';
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-08-01',
          timeSlots: [
            {
              id: 'leg',
              time: '09:00',
              title: 'L',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 20,
              },
            },
          ],
        },
      ],
    };
    const frames = [
      {
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: 'leg',
        route: {} as never,
        temporal: {} as never,
        weather: {} as never,
        road: {} as never,
        repair: {} as never,
        finalExecutionState: 'EXECUTABLE' as const,
        unifiedDelayMinutes: 0,
        reliabilityScore: 0.9,
      },
    ];
    expect(() =>
      assertDAGCanonicalRepairInputs(plan, {}, frames as never, undefined, 'test'),
    ).toThrow(/ONLY_DAG_DECISION_SOURCE/);
  });

  it('passes when DAG has nodes', () => {
    process.env.TRIP_DAG_CANONICAL_LOCK = '1';
    const dag: ExecutionTruthDAG = {
      nodes: [
        {
          id: 'exec:leg',
          date: '2026-08-01',
          slotId: 'leg',
          type: 'LEG',
          execution: {
            finalState: 'OK',
            delayMinutes: 0,
            reliabilityScore: 0.9,
          },
          temporal: {
            daylightViolation: false,
            crossDayRisk: 0,
            arrivalRisk: 0,
          },
          weather: { exposureScore: 0.1 },
          road: { accessibility: 1 },
        },
      ],
      edges: [],
    };
    expect(() => assertOnlyDAGIsDecisionSource(dag, {}, 'test')).not.toThrow();
  });
});
