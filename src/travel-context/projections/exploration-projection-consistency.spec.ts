import { mapExplorationScenarioToTravelContext } from '../snapshot/adapters/exploration-context.adapter';
import { assertExplorationProjectionConsistency } from './exploration-projection-consistency.util';
import { TravelContextProjectionResolverService } from './travel-context-projection-resolver.service';

describe('EXPLORATION-PROJECTION-001 — exploration view consistency', () => {
  const resolver = new TravelContextProjectionResolverService();

  const snapshot = mapExplorationScenarioToTravelContext({
    scenario: {
      id: 'scenario-ctx-1',
      contextId: 'scenario-ctx-1',
      userId: 'user-1',
      status: 'DRAFT',
      researchProtocolId: 'consumer',
      initialInput: {
        destinationCodes: ['IS'],
        dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
        travelers: [{ type: 'ADULT' }],
        source: 'USER_CREATED',
      },
      tripId: null,
      materializedAt: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-05T12:00:00.000Z'),
    },
    candidatesStatus: {
      activeCount: 3,
      selectedRouteId: 'route_a',
      generationVersion: 2,
    },
    rejectedRouteIds: ['route_x', 'route_y'],
  });

  it('exploration projection matches snapshot revision and archive', () => {
    const assertions = assertExplorationProjectionConsistency(snapshot);
    expect(assertions.every((a) => a.pass)).toBe(true);
  });

  it('view envelope carries same contextId and revision as snapshot', () => {
    const envelope = resolver.resolve(snapshot, 'exploration');
    expect(envelope.contextId).toBe(snapshot.identity.contextId);
    expect(envelope.revision).toBe(snapshot.meta.revision);
    expect(envelope.snapshotId).toBe(snapshot.meta.snapshotId);
    expect(envelope.observability?.schemaVersion).toBe('travel-context-v1');
  });

  it('fails when projection embeds GeoJSON (negative control)', () => {
    const withGeo = structuredClone(snapshot);
    (withGeo.intent.destination as Record<string, unknown>).geojson = {
      type: 'FeatureCollection',
      features: [],
    };
    const assertions = assertExplorationProjectionConsistency(withGeo);
    expect(
      assertions.some((a) => a.name === 'exploration_view_has_no_poi_geojson' && !a.pass),
    ).toBe(true);
  });
});
