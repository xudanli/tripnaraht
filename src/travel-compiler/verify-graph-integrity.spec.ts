import { VerifyExecutorService } from '../agent/execution/verify-executor.service';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from './contracts/canonical-travel-graph.types';
import type { PhaseExecutorContext } from '../decision/kernel/interfaces/phase-executor.interface';

describe('VerifyExecutorService GRAPH_COMPILE_INTEGRITY', () => {
  const executor = new VerifyExecutorService();

  it('flags unresolved POI stats on canonical graph', async () => {
    const ctx: PhaseExecutorContext = {
      requestId: 'req1',
      verifyItinerarySource: 'canonical_travel_graph@v0',
      itinerary: { request_id: 'req1', days: [] },
      canonicalTravelGraph: {
        schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
        graphId: 'g1',
        compileId: 'c1',
        destination: { countryCode: 'IS' },
        createdAt: new Date().toISOString(),
        days: [],
        nodes: [],
        edges: [],
        dependencies: [],
        constraints: [],
        bookings: [],
        evidenceCatalog: [],
        stats: {
          nodeCount: 0,
          edgeCount: 0,
          poiResolved: 1,
          poiUnresolved: 2,
          routeTemplatesResolved: 0,
          routeTemplatesTotal: 1,
          routeSegmentsResolved: 0,
          routeSegmentsTotal: 0,
          bookingRequired: 0,
          dependencySatisfied: 0,
          dependencyTotal: 0,
        },
      },
    };

    const stage = (executor as any).stageGraphCompileIntegrity(ctx, [], 0);
    expect(stage.issues.some((i: { code: string }) => i.code === 'GRAPH_POI_UNRESOLVED')).toBe(true);
    expect(stage.issues.some((i: { code: string }) => i.code === 'GRAPH_ROUTE_UNRESOLVED')).toBe(
      true,
    );
  });
});
