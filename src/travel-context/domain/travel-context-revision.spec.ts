import {
  buildTravelContextIdentity,
  mapExplorationStatusToStage,
  readTravelContextIdFromTripMetadata,
} from './travel-context-identity.util';
import {
  buildTravelContextSnapshotId,
  computeTravelContextRevision,
} from './travel-context-revision';

describe('travel-context-revision', () => {
  it('computeTravelContextRevision uses updatedAtMs', () => {
    expect(computeTravelContextRevision({ updatedAtMs: 1_700_000_000_000 })).toBe(
      1_700_000_000_000,
    );
  });

  it('buildTravelContextSnapshotId is stable', () => {
    expect(buildTravelContextSnapshotId('ctx-1', 42)).toBe('tctx_ctx-1_42');
  });
});

describe('travel-context-identity', () => {
  it('mapExplorationStatusToStage for draft exploration', () => {
    expect(
      mapExplorationStatusToStage({
        scenarioStatus: 'DRAFT',
        tripId: null,
        candidatesSelected: false,
      }),
    ).toBe('EXPLORATION');
  });

  it('mapExplorationStatusToStage when route selected', () => {
    expect(
      mapExplorationStatusToStage({
        scenarioStatus: 'DRAFT',
        tripId: null,
        candidatesSelected: true,
      }),
    ).toBe('SCENARIO_SELECTED');
  });

  it('mapExplorationStatusToStage when trip materialized', () => {
    expect(
      mapExplorationStatusToStage({
        scenarioStatus: 'MATERIALIZED',
        tripId: 'trip-1',
        tripStatus: 'PLANNING',
      }),
    ).toBe('PLANNING');
  });

  it('readTravelContextIdFromTripMetadata prefers travelContextId', () => {
    expect(
      readTravelContextIdFromTripMetadata({
        travelContextId: 'ctx-a',
        explorationScenarioId: 'ctx-b',
      }),
    ).toBe('ctx-a');
  });

  it('buildTravelContextIdentity keeps scenarioId defaulting to contextId', () => {
    const id = buildTravelContextIdentity({
      contextId: 'scenario-1',
      ownerUserId: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      stage: 'EXPLORATION',
    });
    expect(id.scenarioId).toBe('scenario-1');
    expect(id.contextId).toBe('scenario-1');
  });
});
