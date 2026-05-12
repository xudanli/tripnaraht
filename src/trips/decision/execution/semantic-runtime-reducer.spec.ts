import type { TripPlan } from '../plan-model';
import { reduceSemanticRuntimeView } from './semantic-runtime-reducer';
import { buildTripExecutionSemanticViewSnapshot } from './trip-execution-semantic-view.builder';

describe('reduceSemanticRuntimeView', () => {
  const payload = {
    weatherByDate: {
      '2026-06-01': { executionState: 'EXECUTABLE' as const, violation: 'NONE' as const },
    },
    planDates: ['2026-06-01'] as const,
  };

  it('chains lineage across rebuilds', () => {
    const first = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'ENGINE_FULL_REBUILD',
        id: 'e1',
        at: '2026-01-01T00:00:00.000Z',
        payload,
      },
    ]);
    expect(first.authority?.lineage?.revision).toBe(1);
    expect(first.authority?.lineage?.parentFingerprint).toBeUndefined();

    const second = reduceSemanticRuntimeView(first, [
      {
        kind: 'ENGINE_FULL_REBUILD',
        id: 'e2',
        at: '2026-01-02T00:00:00.000Z',
        payload,
      },
    ]);
    expect(second.authority?.lineage?.revision).toBe(2);
    expect(second.authority?.lineage?.parentFingerprint).toBe(
      first.authority?.inputsFingerprint,
    );
    expect(second.authority?.lineage?.lastEventId).toBe('e2');
  });

  it('matches standalone snapshot fingerprint when no previous', () => {
    const viaReducer = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'ENGINE_FULL_REBUILD',
        id: 'x',
        at: 't',
        payload,
      },
    ]);
    const direct = buildTripExecutionSemanticViewSnapshot(payload);
    expect(viaReducer.authority?.inputsFingerprint).toBe(
      direct.authority?.inputsFingerprint,
    );
  });

  it('SEMANTIC_DELTA v0 uses fullRebuildFallback and records delta kind in lineage', () => {
    const viaDelta = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'SEMANTIC_DELTA',
        id: 'd1',
        at: '2026-01-01T00:00:00.000Z',
        delta: {
          kind: 'WEATHER_UPDATE',
          payload: {},
          impact: {
            affectedDomains: ['WEATHER'],
            impactScope: 'GLOBAL',
          },
        },
        fullRebuildFallback: payload,
      },
    ]);
    const direct = buildTripExecutionSemanticViewSnapshot(payload);
    expect(viaDelta.authority?.inputsFingerprint).toBe(
      direct.authority?.inputsFingerprint,
    );
    expect(viaDelta.authority?.lineage?.lastEventKind).toBe('SEMANTIC_DELTA');
    expect(viaDelta.authority?.lineage?.lastSemanticDeltaKind).toBe(
      'WEATHER_UPDATE',
    );
    expect(viaDelta.authority?.lineage?.lastSemanticImpactTrace?.staleRegions).toEqual(
      ['FULL_SNAPSHOT'],
    );
  });

  it('ROAD_CONSTRAINT_UPDATE propagates and records ROAD_CONSTRAINT_CHANGE lineage', () => {
    const viaRoad = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'ROAD_CONSTRAINT_UPDATE',
        id: 'r1',
        at: '2026-07-01T08:00:00.000Z',
        constraintEvent: { roadId: 'F208', status: 'IMPASSABLE' },
        fullRebuildFallback: payload,
      },
    ]);
    expect(viaRoad.authority?.lineage?.lastEventKind).toBe('ROAD_CONSTRAINT_UPDATE');
    expect(viaRoad.authority?.lineage?.lastSemanticDeltaKind).toBe(
      'ROAD_CONSTRAINT_CHANGE',
    );
    expect(
      viaRoad.authority?.lineage?.lastSemanticImpactTrace?.staleRegions,
    ).toEqual(['FULL_SNAPSHOT']);
    expect(viaRoad.authority?.lineage?.roadConstraintRuntimeTrace?.requiresReplan).toBe(
      true,
    );
  });

  it('ROAD_CONSTRAINT_UPDATE + tripPlan writes trip fields on delta payload + lineage', () => {
    const tripPlan: TripPlan = {
      version: '1',
      createdAt: 't',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 's1',
              time: '09:00',
              title: 'x',
              type: 'nature',
              poiId: 'LANDMANNALAUGAR',
            },
          ],
        },
      ],
    };
    const viaRoad = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'ROAD_CONSTRAINT_UPDATE',
        id: 'r2',
        at: '2026-07-01T08:00:00.000Z',
        constraintEvent: { roadId: 'F208', status: 'IMPASSABLE' },
        fullRebuildFallback: payload,
        tripPlan,
      },
    ]);
    expect(viaRoad.authority?.lineage?.roadConstraintRuntimeTrace?.tripAffectedDays).toEqual(
      ['2026-06-01'],
    );
    expect(
      viaRoad.authority?.lineage?.roadConstraintRuntimeTrace?.tripAffectedSlotIds,
    ).toEqual(['s1']);
  });

  it('CONSTRAINT_FUSION_UPDATE emits SLOT_BLOCKED and fusion trace', () => {
    const out = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'CONSTRAINT_FUSION_UPDATE',
        id: 'cf1',
        at: '2026-07-01T00:00:00.000Z',
        domainOutputs: [
          {
            domain: 'ROAD',
            severity: 'HIGH',
            affectedSlots: ['slot-x'],
            affectedPOIs: [],
            blocking: true,
            reasonCode: 'road',
            confidence: 1,
          },
          {
            domain: 'WEATHER',
            severity: 'HIGH',
            affectedSlots: ['slot-x'],
            affectedPOIs: [],
            blocking: true,
            reasonCode: 'wind',
            confidence: 1,
          },
        ],
        fullRebuildFallback: payload,
      },
    ]);
    expect(out.authority?.lineage?.lastSemanticDeltaKind).toBe('SLOT_BLOCKED');
    expect(
      out.authority?.lineage?.slotConstraintFusionTrace?.hasMultiDomainHardConflict,
    ).toBe(true);
  });

  it('CONSTRAINT_FUSION_UPDATE + tripPlan emits PARTIAL_REPLAN_EXECUTED and traces', () => {
    const tripPlan = {
      version: '1',
      createdAt: 't',
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'slot-x',
              time: '09:00',
              title: 'x',
              type: 'nature' as const,
            },
          ],
        },
      ],
    };
    const out = reduceSemanticRuntimeView(undefined, [
      {
        kind: 'CONSTRAINT_FUSION_UPDATE',
        id: 'cf2',
        at: '2026-07-01T00:00:00.000Z',
        domainOutputs: [
          {
            domain: 'ROAD',
            severity: 'HIGH',
            affectedSlots: ['slot-x'],
            affectedPOIs: [],
            blocking: true,
            reasonCode: 'r',
            confidence: 1,
          },
        ],
        fullRebuildFallback: payload,
        tripPlan,
      },
    ]);
    expect(out.authority?.lineage?.lastSemanticDeltaKind).toBe(
      'PARTIAL_REPLAN_EXECUTED',
    );
    expect(out.authority?.lineage?.slotRepairTrace?.repairs?.length).toBeGreaterThan(
      0,
    );
    expect(
      out.authority?.lineage?.partialReplanTrace?.boundarySlotIds,
    ).toContain('slot-x');
    expect(
      out.authority?.lineage?.partialReplanTrace?.changedSlotIds?.length,
    ).toBeGreaterThan(0);
  });

  it('rejects SEMANTIC_DELTA when impact omits required domain', () => {
    expect(() =>
      reduceSemanticRuntimeView(undefined, [
        {
          kind: 'SEMANTIC_DELTA',
          id: 'bad',
          at: 't',
          delta: {
            kind: 'WEATHER_UPDATE',
            payload: {},
            impact: {
              affectedDomains: ['BOOKING'],
              impactScope: 'GLOBAL',
            },
          },
          fullRebuildFallback: payload,
        },
      ]),
    ).toThrow(/must include affectedDomains/);
  });
});
