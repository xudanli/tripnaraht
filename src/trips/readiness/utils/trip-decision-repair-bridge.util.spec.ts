import {
  buildTripPlanFromPrismaTrip,
  buildTripWorldStateFromPrismaTrip,
  isDecisionEngineRepairAction,
  mapReadinessActionToDecisionTrigger,
  READINESS_DECISION_ENGINE_PATH,
  type PrismaTripWithDays,
} from './trip-decision-repair-bridge.util';

describe('trip-decision-repair-bridge.util', () => {
  const trip: PrismaTripWithDays = {
    id: 'trip-1',
    destination: 'IS',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-05T00:00:00.000Z'),
    TripDay: [
      {
        id: 'day-1',
        date: new Date('2026-06-01T00:00:00.000Z'),
        ItineraryItem: [
          {
            id: 'item-1',
            type: 'ACTIVITY',
            placeId: 10,
            startTime: new Date('2026-06-01T09:00:00.000Z'),
            endTime: new Date('2026-06-01T11:00:00.000Z'),
            note: null,
            Place: {
              id: 10,
              nameEN: 'Seljalandsfoss',
              nameCN: '塞里雅兰瀑布',
              category: 'attraction',
              metadata: { coordinates: { lat: 63.6, lng: -19.9 } },
            },
          },
        ],
      },
    ],
  };

  it('builds trip plan days and slots from prisma trip', () => {
    const plan = buildTripPlanFromPrismaTrip(trip);
    expect(plan.tripId).toBe('trip-1');
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].timeSlots[0].title).toContain('塞里雅兰');
    expect(plan.days[0].timeSlots[0].poiId).toBe('10');
  });

  it('builds minimal world state with prisma trip id', () => {
    const state = buildTripWorldStateFromPrismaTrip(trip);
    expect(state.context.tripId).toBe('trip-1');
    expect(state.context.destination).toBe('IS');
    expect(state.context.durationDays).toBe(5);
    expect(state.signals.ecoLedgerTripId).toBe('trip-1');
  });

  it('applies authority DecisionScope signals from trip metadata', () => {
    const state = buildTripWorldStateFromPrismaTrip({
      ...trip,
      metadata: {
        authorityDecisionScopeSignals: {
          schemaId: 'tripnara.authority_decision_scope_signals@v1',
          constraintScenarioId: 'weather-outdoor-storm',
          weatherProhibitsOutdoor: 'ACTIVITY_PROHIBITED',
          worldStateSnapshotId: 'wss_meta_1',
          decisionScope: {
            schema: 'tripnara.decision_scope@v1',
            snapshotId: 'wss_meta_1',
            tripId: 'trip-1',
            trigger: 'WEATHER_ACTIVITY_PROHIBITED',
            affectedObjects: [],
            affectedDays: [1],
            decisionWindow: { from: 'a', to: 'b' },
            mutableObjects: [{ kind: 'PLAN_ITEM', id: 'item-1' }],
            lockedObjects: [],
            allowedActions: ['REPLACE_ITEM'],
            forbiddenActions: [],
            hardConstraints: [],
            softObjectives: [],
          },
          affectedPlanItemIds: ['item-1'],
          stampedAt: '2026-07-17T10:00:00.000Z',
        },
      },
    });
    expect((state.signals as any).worldStateSnapshotId).toBe('wss_meta_1');
    expect((state.signals as any).weatherProhibitsOutdoor).toBe('ACTIVITY_PROHIBITED');
    expect((state.signals as any).decisionScope?.snapshotId).toBe('wss_meta_1');
  });

  it('maps readiness actions to decision triggers', () => {
    expect(mapReadinessActionToDecisionTrigger('fetch_weather')).toBe('weather_update');
    expect(mapReadinessActionToDecisionTrigger('remove_pois')).toBe('manual_repair');
    expect(mapReadinessActionToDecisionTrigger('adjust_time')).toBe('manual_repair');
    expect(mapReadinessActionToDecisionTrigger('replace_poi')).toBe('manual_repair');
    expect(mapReadinessActionToDecisionTrigger('refresh')).toBe('signal_update');
  });

  it('recognizes feasibility Plan B actions as decision-engine repairs', () => {
    expect(isDecisionEngineRepairAction('adjust_time')).toBe(true);
    expect(isDecisionEngineRepairAction('replace_poi')).toBe(true);
    expect(isDecisionEngineRepairAction('refresh')).toBe(false);
  });

  it('exports canonical decision engine repair path', () => {
    expect(READINESS_DECISION_ENGINE_PATH).toBe('/api/decision-engine/v1/repair-plan');
  });
});
