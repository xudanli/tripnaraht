import { buildIcelandPlanningContextFixture } from '../../harness/evals/fixtures/contexts/iceland-planning.fixture';
import { mapTripContextSnapshotToTravelContext } from './adapters/trip-context.adapter';
import { TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import type { TripContextSnapshotView } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import {
  buildExplorationArchive,
  mergeTravelContextExplorationArchive,
  readExplorationArchiveFromTripMetadata,
} from '../../trips/exploration/utils/exploration-archive.util';
import { EXPLORATION_ROUTE_VARIANT_STATUS } from '../../trips/exploration/constants/exploration-status.constants';
import { projectOverviewView } from '../projections/overview.projection';

/**
 * RFC-003 §12.5 — Materialize continuity DoD (Phase 4).
 * Validates contextId persistence + explorationArchive round-trip via trip metadata.
 */
describe('MATERIALIZE-CONTINUITY-001 — contextId + explorationArchive', () => {
  const contextId = 'scenario-iceland-001';

  it('materialize writes archive to trip.metadata.travelContext and snapshot reads it', () => {
    const archive = buildExplorationArchive({
      variants: [
        { routeId: 'route-a', status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
        { routeId: 'route-b', status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
        { routeId: 'route-c', status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
      ],
      researchProtocolId: 'iceland-discovery-v1',
      materializedAt: '2026-07-05T12:00:00.000Z',
      principles: ['PACE', 'SAFETY'],
    });

    const tripMetadata = mergeTravelContextExplorationArchive(
      { source: 'exploration', explorationScenarioId: contextId },
      { contextId, explorationArchive: archive },
    );

    expect(tripMetadata.travelContextId).toBe(contextId);
    const readBack = readExplorationArchiveFromTripMetadata(tripMetadata);
    expect(readBack?.rejectedRouteIds).toEqual(['route-a', 'route-b']);
    expect(readBack?.selectedRouteId).toBe('route-c');
    expect(readBack?.principles).toEqual(['PACE', 'SAFETY']);
  });

  it('trip adapter maps archive into history + overview at same contextId', () => {
    const explorationSnapshot = buildIcelandPlanningContextFixture();
    expect(explorationSnapshot.identity.contextId).toBe(explorationSnapshot.identity.scenarioId);

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
        rankedPrinciples: ['PACE', 'SAFETY'],
        destination: 'Iceland',
        startDate: '2026-08-01',
        endDate: '2026-08-05',
        durationDays: 5,
        tripStatus: 'PLANNING',
      },
      members: { count: 2, travelers: [] },
      preferences: { tripScoped: {}, userScopedAvailable: false },
      contract: {
        objectives: { rankedPrinciples: ['PACE', 'SAFETY'], version: 1 },
        changeStrategy: { archetype: 'BALANCED' },
        automation: { defaultLevel: 'SUGGEST' },
        teamGovernance: {},
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 0,
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
      openDecisions: { count: 0, blockingCount: 0, actionableCount: 0, problemIds: [] },
      uncertainties: [],
      monitoring: { activeCount: 0, items: [] },
      decisionHistory: [],
    };

    const archive = buildExplorationArchive({
      variants: [
        { routeId: 'route-a', status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
        { routeId: 'route-b', status: EXPLORATION_ROUTE_VARIANT_STATUS.ARCHIVED },
        { routeId: 'route-c', status: EXPLORATION_ROUTE_VARIANT_STATUS.SELECTED },
      ],
      researchProtocolId: 'iceland-discovery-v1',
      materializedAt: '2026-07-05T12:00:00.000Z',
      principles: ['PACE', 'SAFETY'],
    });

    const materialized = mapTripContextSnapshotToTravelContext({
      contextId,
      ownerUserId: 'user-1',
      tripSnapshot: tripView,
      explorationArchive: archive,
    });

    expect(materialized.identity.contextId).toBe(contextId);
    expect(materialized.identity.tripId).toBe('trip-1');
    expect(materialized.identity.stage).toBe('PLANNING');
    expect(materialized.history.explorationArchive?.rejectedRouteIds).toEqual([
      'route-a',
      'route-b',
    ]);
    expect(materialized.plan.selectedRouteId).toBe('route-c');
    expect(materialized.history.recent.some((e) => e.kind === 'EXPLORATION_MILESTONE')).toBe(true);

    const overview = projectOverviewView(materialized);
    expect(overview.planSummary).toMatchObject({ selectedRouteId: 'route-c' });
    expect(materialized.meta.revision).toBeGreaterThan(0);
  });
});
