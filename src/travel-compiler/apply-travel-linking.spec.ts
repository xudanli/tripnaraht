import { applyTravelSemanticAndLinking } from './linking/apply-travel-linking.util';
import type { CanonicalTravelGraph } from './contracts/canonical-travel-graph.types';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from './contracts/canonical-travel-graph.types';

describe('applyTravelSemanticAndLinking', () => {
  it('adds booking dependency for Blue Lagoon', () => {
    const graph: CanonicalTravelGraph = {
      schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
      graphId: 'g1',
      compileId: 'c1',
      destination: { countryCode: 'IS' },
      createdAt: new Date().toISOString(),
      days: [],
      nodes: [
        {
          nodeId: 'poi1',
          kind: 'POI',
          label: 'Blue Lagoon',
          dayIndex: 0,
          canonical: { poiId: 'is.blue_lagoon' },
        },
      ],
      edges: [],
      dependencies: [],
      constraints: [],
      bookings: [],
      evidenceCatalog: [],
      stats: {
        nodeCount: 1,
        edgeCount: 0,
        poiResolved: 1,
        poiUnresolved: 0,
        routeTemplatesResolved: 0,
        routeTemplatesTotal: 0,
        routeSegmentsResolved: 0,
        routeSegmentsTotal: 0,
        bookingRequired: 0,
        dependencySatisfied: 0,
        dependencyTotal: 0,
      },
    };

    const { graph: linked, stats } = applyTravelSemanticAndLinking(graph, 'IS');
    expect(stats.bookingsAdded).toBe(1);
    expect(linked.bookings.length).toBe(1);
    expect(linked.dependencies.some((d) => d.kind === 'REQUIRES_BOOKING')).toBe(true);
    expect(linked.nodes[0]?.intentTags).toContain('relax');
  });
});
