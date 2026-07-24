import { inferRepairAffectedDayIndices } from './infer-repair-affected-days.util';
import { mergeIncrementalTravelGraph } from './merge-incremental-travel-graph.util';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from '../contracts/canonical-travel-graph.types';

describe('inferRepairAffectedDayIndices', () => {
  it('detects changed day from itinerary diff', () => {
    const before = {
      request_id: 'r1',
      days: [
        { date: '2026-08-01', items: [{ id: 'a', type: 'POI' as const, location_ref: { name: 'A' } }] },
        { date: '2026-08-02', items: [{ id: 'b', type: 'POI' as const, location_ref: { name: 'B' } }] },
      ],
    };
    const after = {
      request_id: 'r1',
      days: [
        { date: '2026-08-01', items: [{ id: 'a', type: 'POI' as const, location_ref: { name: 'A' } }] },
        { date: '2026-08-02', items: [{ id: 'c', type: 'POI' as const, location_ref: { name: 'C' } }] },
      ],
    };

    expect(inferRepairAffectedDayIndices({ itineraryBefore: before, itineraryAfter: after })).toEqual([1]);
  });
});

function minimalGraph(dayIndex: number, poiId: string, nodeId: string) {
  return {
    schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
    graphId: `g_${dayIndex}`,
    compileId: `c_${dayIndex}`,
    destination: { countryCode: 'IS' },
    createdAt: new Date().toISOString(),
    days: [{ nodeId: `d${dayIndex}`, kind: 'DAY' as const, label: `Day ${dayIndex + 1}`, dayIndex }],
    nodes: [
      { nodeId: `d${dayIndex}`, kind: 'DAY' as const, label: `Day ${dayIndex + 1}`, dayIndex },
      {
        nodeId,
        kind: 'POI' as const,
        label: poiId,
        dayIndex,
        canonical: { poiId },
        poiId,
      },
    ],
    edges: [
      {
        edgeId: `e${dayIndex}`,
        kind: 'CONTAINS' as const,
        from: { nodeId: `d${dayIndex}`, kind: 'DAY' as const },
        to: { nodeId, kind: 'POI' as const },
      },
    ],
    dependencies: [],
    constraints: [],
    bookings: [],
    evidenceCatalog: [],
    stats: {
      nodeCount: 2,
      edgeCount: 1,
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
}

describe('mergeIncrementalTravelGraph', () => {
  it('preserves untouched days while replacing affected day slice', () => {
    const previous = minimalGraph(0, 'is.blue_lagoon', 'p0');
    const incremental = minimalGraph(1, 'is.reynisfjara', 'p1');

    const merged = mergeIncrementalTravelGraph({
      previous,
      incremental,
      affectedDayIndices: [1],
    });

    expect(merged.nodes.some((n) => n.canonical?.poiId === 'is.blue_lagoon')).toBe(true);
    expect(merged.nodes.some((n) => n.canonical?.poiId === 'is.reynisfjara')).toBe(true);
    expect(merged.graphId).toBe(previous.graphId);
  });
});
