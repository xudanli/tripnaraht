import { graphToTripPlan } from './graph-to-trip-plan.util';
import { graphToItinerary } from './graph-to-itinerary.util';
import type { CanonicalTravelGraph } from '../contracts/canonical-travel-graph.types';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from '../contracts/canonical-travel-graph.types';

const baseStats: CanonicalTravelGraph['stats'] = {
  nodeCount: 3,
  edgeCount: 3,
  poiResolved: 2,
  poiUnresolved: 0,
  routeTemplatesResolved: 0,
  routeTemplatesTotal: 0,
  routeSegmentsResolved: 0,
  routeSegmentsTotal: 0,
  bookingRequired: 0,
  dependencySatisfied: 0,
  dependencyTotal: 0,
};

describe('graph projections', () => {
  const graph: CanonicalTravelGraph = {
    schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
    graphId: 'g_test',
    compileId: 'c_test',
    requestId: 'req_test',
    destination: { countryCode: 'IS' },
    createdAt: new Date().toISOString(),
    days: [{ nodeId: 'd0', kind: 'DAY', label: 'Day 1', dayIndex: 0, date: '2026-08-01' }],
    nodes: [
      { nodeId: 'd0', kind: 'DAY', label: 'Day 1', dayIndex: 0, date: '2026-08-01' },
      {
        nodeId: 'p1',
        kind: 'POI',
        label: 'Blue Lagoon',
        dayIndex: 0,
        canonical: { poiId: 'is.blue_lagoon', activityType: 'spa' },
        intentTags: ['relax'],
      },
      {
        nodeId: 'p2',
        kind: 'POI',
        label: 'Reynisfjara',
        dayIndex: 0,
        canonical: { poiId: 'is.reynisfjara' },
      },
    ],
    edges: [
      {
        edgeId: 'e1',
        kind: 'CONTAINS',
        from: { nodeId: 'd0', kind: 'DAY' },
        to: { nodeId: 'p1', kind: 'POI' },
      },
      {
        edgeId: 'e2',
        kind: 'CONTAINS',
        from: { nodeId: 'd0', kind: 'DAY' },
        to: { nodeId: 'p2', kind: 'POI' },
      },
      {
        edgeId: 'e3',
        kind: 'AFTER',
        from: { nodeId: 'p1', kind: 'POI' },
        to: { nodeId: 'p2', kind: 'POI' },
      },
    ],
    dependencies: [],
    constraints: [],
    bookings: [],
    evidenceCatalog: [],
    stats: baseStats,
  };

  it('graphToTripPlan preserves poi order and ids', () => {
    const plan = graphToTripPlan(graph);
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0]?.timeSlots.map((s) => s.poiId)).toEqual([
      'is.blue_lagoon',
      'is.reynisfjara',
    ]);
  });

  it('graphToItinerary projects itinerary items', () => {
    const itinerary = graphToItinerary(graph);
    expect(itinerary.request_id).toBe('req_test');
    expect(itinerary.days[0]?.items).toHaveLength(2);
    expect(itinerary.days[0]?.items[0]?.metadata?.canonical_poi_id).toBe('is.blue_lagoon');
  });

  it('projects route segments, bookings, and stay nodes', () => {
    const richGraph: CanonicalTravelGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          nodeId: 'seg1',
          kind: 'ROUTE_SEGMENT',
          label: 'Thingvellir → Geysir',
          dayIndex: 0,
          segmentId: 'is.gc.thingvellir_geysir',
          fromPoiId: 'is.thingvellir',
          toPoiId: 'is.geysir',
          distanceKm: 60,
          durationMin: 55,
          transportMode: 'drive',
        },
        {
          nodeId: 'p3',
          kind: 'POI',
          label: 'Thingvellir',
          dayIndex: 0,
          canonical: { poiId: 'is.thingvellir' },
        },
        {
          nodeId: 'p4',
          kind: 'POI',
          label: 'Geysir',
          dayIndex: 0,
          canonical: { poiId: 'is.geysir' },
        },
        {
          nodeId: 'stay1',
          kind: 'STAY',
          label: 'Reykjavik Hotel',
          dayIndex: 0,
          checkInHint: '20:00',
          checkOutHint: '08:00',
        },
        {
          nodeId: 'book1',
          kind: 'BOOKING',
          label: 'Blue Lagoon ticket',
          dayIndex: 0,
          linkedNodeId: 'p1',
          bookingKind: 'ticket',
          required: true,
          status: 'required',
        },
      ],
      edges: [
        ...graph.edges,
        {
          edgeId: 'e4',
          kind: 'CONTAINS',
          from: { nodeId: 'd0', kind: 'DAY' },
          to: { nodeId: 'p3', kind: 'POI' },
        },
        {
          edgeId: 'e5',
          kind: 'CONTAINS',
          from: { nodeId: 'd0', kind: 'DAY' },
          to: { nodeId: 'p4', kind: 'POI' },
        },
        {
          edgeId: 'e6',
          kind: 'AFTER',
          from: { nodeId: 'p3', kind: 'POI' },
          to: { nodeId: 'p4', kind: 'POI' },
        },
        {
          edgeId: 'e7',
          kind: 'REQUIRES_BOOKING',
          from: { nodeId: 'p1', kind: 'POI' },
          to: { nodeId: 'book1', kind: 'BOOKING' },
        },
      ],
      bookings: [
        {
          nodeId: 'book1',
          kind: 'BOOKING',
          label: 'Blue Lagoon ticket',
          dayIndex: 0,
          linkedNodeId: 'p1',
          bookingKind: 'ticket',
          required: true,
          status: 'required',
        },
      ],
      stats: {
        ...baseStats,
        bookingRequired: 1,
      },
    };

    const plan = graphToTripPlan(richGraph);
    const slotKinds = plan.days[0]?.timeSlots.map((s) => s.type);
    expect(slotKinds).toContain('transport');
    expect(slotKinds).toContain('hotel');

    const itinerary = graphToItinerary(richGraph);
    const itemTypes = itinerary.days[0]?.items.map((i) => i.type);
    expect(itemTypes).toContain('DRIVE');
    expect(itemTypes).toContain('ACCOMMODATION');

    const bookingItem = itinerary.days[0]?.items.find((i) => i.metadata?.booking_kind === 'ticket');
    expect(bookingItem?.notes).toBe('booking_required');

    const segmentItem = itinerary.days[0]?.items.find((i) => i.type === 'DRIVE');
    expect(segmentItem?.metadata?.route_segment_ref).toBe('is.gc.thingvellir_geysir');
    expect(segmentItem?.metadata?.duration_minutes).toBe(55);
  });
});
