import { applyRouteResolution } from './apply-route-resolution.util';
import { matchRouteTemplate } from './route-template-matcher.util';
import { buildCanonicalTravelGraph } from '../utils/travel-graph-builder.util';
import {
  PLANNER_DRAFT_IR_SCHEMA_ID,
  type PlannerDraftIR,
} from '../contracts/planner-draft-ir.types';

function goldenCircleDraft(): PlannerDraftIR {
  return {
    schemaId: PLANNER_DRAFT_IR_SCHEMA_ID,
    compileRequestId: 'req_gc',
    source: 'agent_planner',
    destination: { countryCode: 'IS' },
    days: [
      {
        dayIndex: 0,
        date: '2026-08-01',
        slots: [
          {
            slotId: 's1',
            rawText: '黄金圈',
            hintType: 'route',
            timeHint: 'full_day',
          },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
  };
}

describe('route-template-matcher', () => {
  it('matches Golden Circle aliases', () => {
    expect(matchRouteTemplate('黄金圈', 'IS')?.template.routeTemplateId).toBe('is.golden_circle');
    expect(matchRouteTemplate('Golden Circle day trip', 'IS')?.template.routeTemplateId).toBe(
      'is.golden_circle',
    );
  });
});

describe('applyRouteResolution', () => {
  it('expands Golden Circle into route, segments, and waypoint POIs', () => {
    const draft = goldenCircleDraft();
    let graph = buildCanonicalTravelGraph({ draft, compileId: 'c1', resolutions: new Map() });

    const { graph: resolved, stats } = applyRouteResolution({
      graph,
      draft,
      countryCode: 'IS',
    });

    expect(stats.templatesMatched).toBe(1);
    expect(stats.segmentsAdded).toBe(2);
    expect(stats.waypointPoisAdded).toBe(3);

    const routeNode = resolved.nodes.find((n) => n.kind === 'ROUTE');
    expect(routeNode?.routeTemplateId).toBe('is.golden_circle');

    const segments = resolved.nodes.filter((n) => n.kind === 'ROUTE_SEGMENT');
    expect(segments).toHaveLength(2);

    const poiIds = resolved.nodes
      .filter((n) => n.kind === 'POI')
      .map((n) => n.canonical?.poiId)
      .filter(Boolean);
    expect(poiIds).toEqual(
      expect.arrayContaining(['is.thingvellir', 'is.geysir', 'is.gullfoss']),
    );

    expect(resolved.stats.routeTemplatesResolved).toBe(1);
    expect(resolved.stats.routeSegmentsResolved).toBe(2);
    expect(resolved.edges.some((e) => e.kind === 'PART_OF_ROUTE')).toBe(true);
  });

  it('reuses existing POI nodes on the same day', () => {
    const draft = goldenCircleDraft();
    draft.days[0]!.slots.push({
      slotId: 's2',
      rawText: 'Gullfoss',
      hintType: 'poi',
    });

    const resolutions = new Map([
      [
        's2',
        {
          status: 'MATCHED',
          poiId: 'is.gullfoss',
          confidence: 0.95,
          method: 'EXACT',
          matchedPoi: { canonicalName: 'Gullfoss' },
        } as never,
      ],
    ]);

    let graph = buildCanonicalTravelGraph({ draft, compileId: 'c2', resolutions });
    const gullfossBefore = graph.nodes.filter(
      (n) => n.kind === 'POI' && n.canonical?.poiId === 'is.gullfoss',
    ).length;

    const { graph: resolved } = applyRouteResolution({ graph, draft, countryCode: 'IS' });
    const gullfossAfter = resolved.nodes.filter(
      (n) => n.kind === 'POI' && n.canonical?.poiId === 'is.gullfoss',
    ).length;

    expect(gullfossBefore).toBe(1);
    expect(gullfossAfter).toBe(1);
  });
});
