import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from '../contracts/canonical-travel-graph.types';
import { applyGraphVerifySsot } from './apply-graph-verify-ssot.util';
import { graphToItinerary } from './graph-to-itinerary.util';

describe('applyGraphVerifySsot', () => {
  it('replaces itinerary with graph projection and preserves planner raw copy', () => {
    const graph = {
      schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
      graphId: 'g1',
      compileId: 'c1',
      destination: { countryCode: 'IS' },
      createdAt: new Date().toISOString(),
      days: [{ nodeId: 'd0', kind: 'DAY' as const, label: 'Day 1', dayIndex: 0 }],
      nodes: [],
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

    const projected = graphToItinerary({
      ...graph,
      nodes: [
        {
          nodeId: 'p1',
          kind: 'POI',
          label: 'Blue Lagoon',
          dayIndex: 0,
          canonical: { poiId: 'is.blue_lagoon' },
        },
      ],
      days: [{ nodeId: 'd0', kind: 'DAY', label: 'Day 1', dayIndex: 0, date: '2026-08-01' }],
      edges: [
        {
          edgeId: 'e1',
          kind: 'CONTAINS',
          from: { nodeId: 'd0', kind: 'DAY' },
          to: { nodeId: 'p1', kind: 'POI' },
        },
      ],
    });

    const plannerItinerary = {
      request_id: 'req1',
      days: [{ date: '2026-08-01', items: [{ id: 'raw', type: 'POI' as const, location_ref: { name: '蓝湖' } }] }],
    };

    const state: OrchestratorState = {
      request_id: 'req1',
      current_step: 'TRAVEL_COMPILE',
      itinerary: plannerItinerary as never,
      metadata: {
        canonical_travel_graph: graph,
        graph_projected_itinerary: projected,
      },
    } as OrchestratorState;

    const result = applyGraphVerifySsot(state);

    expect(result.applied).toBe(true);
    expect(state.itinerary?.days[0]?.items[0]?.metadata?.canonical_poi_id).toBe('is.blue_lagoon');
    expect((state.metadata as Record<string, unknown>).planner_raw_itinerary).toEqual(plannerItinerary);
    expect((state.metadata as Record<string, unknown>).verify_itinerary_source).toBe(
      'canonical_travel_graph@v0',
    );
  });
});
