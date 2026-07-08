import { applyGraphCanonicalTagsToPlanState } from './apply-graph-to-plan-state-segments.util';
import { CANONICAL_TRAVEL_GRAPH_SCHEMA_ID } from '../../../travel-compiler/contracts/canonical-travel-graph.types';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';

describe('applyGraphCanonicalTagsToPlanState', () => {
  it('writes canonical_poi_id onto segment attractions and ctreResolvedPois', () => {
    const planState: PlanState = {
      plan_id: 'p1',
      plan_version: 1,
      constraints: { time: { days: 1 }, budget: {}, fitness: {} },
      itinerary: {
        tripId: 't1',
        routeDirectionId: 'r1',
        segments: [
          {
            segmentId: 's1',
            dayIndex: 0,
            distanceKm: 0,
            ascentM: 0,
            slopePct: 0,
            metadata: {
              attractions: [{ name: 'Gullfoss' }, { name: 'Geysir' }],
            },
          },
        ],
      },
      mobility: { transferSegments: [] },
      budget: {},
      pace: {},
      gate: { status: 'NEED_CONFIRM', reasons: [], missingEvidence: [] },
      evidence_refs: [],
      decision_log_refs: [],
      status: 'PROPOSED',
    };

    const graph = {
      schemaId: CANONICAL_TRAVEL_GRAPH_SCHEMA_ID,
      graphId: 'g1',
      compileId: 'c1',
      destination: { countryCode: 'IS' },
      createdAt: new Date().toISOString(),
      days: [{ nodeId: 'd0', kind: 'DAY' as const, label: 'D1', dayIndex: 0 }],
      nodes: [
        {
          nodeId: 'p_gull',
          kind: 'POI' as const,
          label: 'Gullfoss',
          dayIndex: 0,
          canonical: { poiId: 'is.gullfoss' },
        },
        {
          nodeId: 'p_geysir',
          kind: 'POI' as const,
          label: 'Geysir',
          dayIndex: 0,
          canonical: { poiId: 'is.geysir' },
        },
        {
          nodeId: 'route1',
          kind: 'ROUTE' as const,
          label: 'Golden Circle',
          dayIndex: 0,
          routeTemplateId: 'is.golden_circle',
        },
      ],
      edges: [],
      dependencies: [],
      constraints: [],
      bookings: [],
      evidenceCatalog: [],
      stats: {
        nodeCount: 3,
        edgeCount: 0,
        poiResolved: 2,
        poiUnresolved: 0,
        routeTemplatesResolved: 1,
        routeTemplatesTotal: 1,
        routeSegmentsResolved: 0,
        routeSegmentsTotal: 0,
        bookingRequired: 0,
        dependencySatisfied: 0,
        dependencyTotal: 0,
      },
    };

    const stats = applyGraphCanonicalTagsToPlanState({ planState, graph });

    expect(stats.segmentsUpdated).toBe(1);
    expect(stats.poiTagsApplied).toBeGreaterThanOrEqual(2);
    expect(stats.routeTemplatesTagged).toBe(1);

    const md = planState.itinerary.segments[0]?.metadata as Record<string, unknown>;
    const attractions = md?.attractions as Array<Record<string, unknown>>;
    expect(attractions?.[0]?.canonical_poi_id).toBe('is.gullfoss');
    expect(md?.routeTemplateId).toBe('is.golden_circle');
    expect(Array.isArray(md?.ctreResolvedPois)).toBe(true);
  });
});
