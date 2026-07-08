import { mapExplorationScenarioToTravelContext } from './exploration-context.adapter';
import { mapTripContextSnapshotToTravelContext } from './trip-context.adapter';
import { TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import type { TripContextSnapshotView } from '../../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';

describe('exploration-context.adapter', () => {
  it('maps exploration scenario to travel context snapshot', () => {
    const snapshot = mapExplorationScenarioToTravelContext({
      scenario: {
        id: 'scenario-1',
        contextId: 'scenario-1',
        userId: 'user-1',
        status: 'DRAFT',
        researchProtocolId: null,
        initialInput: {
          destinationCodes: ['IS'],
          dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
          travelers: [{ type: 'ADULT', age: 35 }],
          source: 'USER_CREATED',
        },
        tripId: null,
        materializedAt: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-05T00:00:00.000Z'),
      },
      candidatesStatus: {
        activeCount: 3,
        selectedRouteId: null,
        generationVersion: 1,
      },
      rejectedRouteIds: [],
    });

    expect(snapshot.identity.contextId).toBe('scenario-1');
    expect(snapshot.identity.stage).toBe('EXPLORATION');
    expect(snapshot.intent.destination.countryCode).toBe('IS');
    expect(snapshot.plan.effectivePlan.hasEffectivePlan).toBe(false);
    expect(snapshot.meta.revision).toBe(new Date('2026-07-05T00:00:00.000Z').getTime());
  });
});

describe('trip-context.adapter', () => {
  it('maps trip context snapshot with exploration archive', () => {
    const tripView: TripContextSnapshotView = {
      schemaId: TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID,
      snapshotId: 'tcs_trip-1_x',
      revision: 'rev-1',
      tripId: 'trip-1',
      createdAt: '2026-07-05T12:00:00.000Z',
      tripUpdatedAt: '2026-07-05T12:00:00.000Z',
      bindings: {
        constraintsVersion: 2,
        effectivePlanVersionId: 'pv-1',
        worldSnapshotId: 'ws-1',
        dataCompletenessScore: 0.8,
      },
      goal: {
        rankedPrinciples: ['LOW_DRIVING'],
        destination: 'Iceland',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        durationDays: 5,
        tripStatus: 'PLANNING',
      },
      members: { count: 2, travelers: [] },
      preferences: { tripScoped: {}, userScopedAvailable: false },
      contract: {
        objectives: { rankedPrinciples: ['LOW_DRIVING'], version: 1 },
        changeStrategy: { archetype: 'BALANCED' },
        automation: { defaultLevel: 'SUGGEST' },
        teamGovernance: {},
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 1,
          pendingConfirm: 0,
          conflictConstraintIds: [],
        },
      },
      effectivePlan: {
        versionId: 'pv-1',
        dayCount: 5,
        itemCount: 12,
        hasEffectivePlan: true,
      },
      worldFacts: {},
      openDecisions: {
        count: 1,
        blockingCount: 0,
        actionableCount: 1,
        problemIds: ['prob-1'],
      },
      uncertainties: [],
      monitoring: { activeCount: 0, items: [] },
      decisionHistory: [],
    };

    const travel = mapTripContextSnapshotToTravelContext({
      contextId: 'scenario-1',
      ownerUserId: 'user-1',
      tripSnapshot: tripView,
      explorationArchive: {
        rejectedRouteIds: ['route-a', 'route-b'],
        selectedRouteId: 'route-c',
        materializedAt: '2026-07-05T11:00:00.000Z',
      },
    });

    expect(travel.identity.contextId).toBe('scenario-1');
    expect(travel.identity.tripId).toBe('trip-1');
    expect(travel.identity.stage).toBe('PLANNING');
    expect(travel.history.explorationArchive?.rejectedRouteIds).toEqual(['route-a', 'route-b']);
    expect(travel.history.recent[0]?.kind).toBe('EXPLORATION_MILESTONE');
    expect(travel.decisions.counts.total).toBe(1);
  });
});
