import {
  PhysicalActionPlanEnricherService,
  combineDateAndStartWindowToIso,
  collectPoiCardMatchKeys,
} from './physical-action-plan-enricher.service';
import type { SpatialGraphService } from './spatial-graph.service';
import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';

describe('PhysicalActionPlanEnricherService', () => {
  it('combineDateAndStartWindowToIso builds UTC ISO', () => {
    expect(combineDateAndStartWindowToIso('2026-07-15', '09:30')).toContain('2026-07-15T09:30');
  });

  it('enrichRouteAndRunPayload appends physical_domain actions when Place maps to spatial POI', async () => {
    const spatialGraph = {
      resolveSpatialPoiIdFromPlaceId: jest.fn().mockResolvedValue('spoi-1'),
      findSegmentsTouchingSpatialPoi: jest.fn().mockResolvedValue([
        {
          id: 'seg-f',
          segmentType: 'F_ROAD',
          fromPoiId: 'a',
          toPoiId: 'b',
          evidence: { note: 'uses F570 here' },
        },
      ]),
      pickSegmentForPhysicalGate: (segments: Array<{ segmentType: string }>) =>
        segments.find((s) => s.segmentType === 'F_ROAD') ?? segments[0] ?? null,
      extractRoadIdsFromEvidence: (ev: unknown) => {
        if (!ev || typeof ev !== 'object') return [];
        const text = JSON.stringify(ev);
        const matches = text.match(/\bF\d{1,4}\b/gi);
        return matches ? [...new Set(matches.map((m) => m.toUpperCase()))] : [];
      },
    } as unknown as SpatialGraphService;

    const enricher = new PhysicalActionPlanEnricherService(spatialGraph);

    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'item-1',
              type: 'POI',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { place_id: '381112', name: 'Test' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };

    const payload: Record<string, unknown> = {
      orchestrationResult: { itinerary },
    };

    await enricher.enrichRouteAndRunPayload(payload);

    const plan = itinerary.action_plan as unknown[];
    expect(Array.isArray(plan) && plan.length).toBeGreaterThan(0);
    const ai = (plan![0] as Record<string, unknown>).action_input as Record<string, unknown>;
    expect((ai.physical_domain as { segment_id?: string }).segment_id).toBe('seg-f');
    expect((ai.froad_check_hints as { road_ids: string[] }).road_ids).toContain('F570');
    const sp = ai.spatial_projection as { poi_card_match_keys?: string[] };
    expect(sp.poi_card_match_keys).toContain('item-1');
    expect(sp.poi_card_match_keys).toContain('381112');
  });

  it('normalizePhysicalActionTargets fills target_ref and poi_card_match_keys when only spatial_projection present', async () => {
    const spatialGraph = {
      resolveSpatialPoiIdFromPlaceId: jest.fn().mockResolvedValue(null),
      findSegmentsTouchingSpatialPoi: jest.fn(),
      pickSegmentForPhysicalGate: jest.fn(),
      extractRoadIdsFromEvidence: jest.fn(),
    };
    const enricher = new PhysicalActionPlanEnricherService(spatialGraph as unknown as SpatialGraphService);

    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'it-poi-1',
              type: 'POI',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { place_id: '99', name: 'X' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
      action_plan: [
        {
          action_id: 'pre',
          action_type: 'ADJUST' as any,
          target_type: 'ACTIVITY' as any,
          action_input: {
            physical_domain: {
              segment_id: 'seg-1',
              enter_at: '2026-06-01T10:00:00.000Z',
            },
            spatial_projection: { itinerary_item_id: 'it-poi-1', place_id: 99 },
          },
        } as any,
      ],
    };

    await enricher.enrichRouteAndRunPayload({ orchestrationResult: { itinerary } });
    const ap = itinerary.action_plan![0] as Record<string, unknown>;
    expect(ap['target_ref']).toBe('it-poi-1');
    const sp = (ap['action_input'] as Record<string, unknown>)['spatial_projection'] as Record<string, unknown>;
    expect(sp['poi_card_match_keys']).toContain('it-poi-1');
    expect(sp['poi_card_match_keys']).toContain('99');
  });

  it('collectPoiCardMatchKeys reads metadata aliases', () => {
    const keys = collectPoiCardMatchKeys({
      id: 'a',
      type: 'POI',
      start_window: '1',
      end_window: '2',
      location_ref: { name: 'n' },
      metadata: { itinerary_item_id_aliases: ['alias-1'] },
    } as any);
    expect(keys).toEqual(expect.arrayContaining(['a', 'alias-1']));
  });

  it('skips enrichment on consultation surface', async () => {
    const spatialGraph = {
      resolveSpatialPoiIdFromPlaceId: jest.fn(),
      findSegmentsTouchingSpatialPoi: jest.fn(),
      pickSegmentForPhysicalGate: jest.fn(),
      extractRoadIdsFromEvidence: jest.fn(),
    };
    const enricher = new PhysicalActionPlanEnricherService(spatialGraph as unknown as SpatialGraphService);
    const itinerary: Itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              id: 'item-1',
              type: 'POI',
              start_window: '10:00',
              end_window: '11:00',
              location_ref: { place_id: '1', name: 'Test' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    await enricher.enrichRouteAndRunPayload({
      ui_surface: 'consultation',
      orchestrationResult: { itinerary },
    });
    expect(spatialGraph.resolveSpatialPoiIdFromPlaceId).not.toHaveBeenCalled();
  });
});
