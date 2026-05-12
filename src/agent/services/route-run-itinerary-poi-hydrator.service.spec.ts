import {
  applyRouteRunPoiDisplayNamesToTimeline,
  buildItineraryFromPersistedTripDays,
  classifyPlaceRef,
  type RouteRunPoiCard,
} from './route-run-itinerary-poi-hydrator.service';

describe('route-run-itinerary-poi-hydrator classifyPlaceRef', () => {
  it('detects numeric id', () => {
    expect(classifyPlaceRef('381112')).toEqual({ kind: 'numeric_id', id: 381112 });
  });

  it('detects uuid', () => {
    const u = '550e8400-e29b-41d4-a716-446655440000';
    expect(classifyPlaceRef(u)).toEqual({ kind: 'uuid', uuid: u });
  });

  it('detects google place id ChIJ', () => {
    expect(classifyPlaceRef('ChIJxxxxxxxxxxxx')).toEqual({
      kind: 'google_place_id',
      google_place_id: 'ChIJxxxxxxxxxxxx',
    });
  });

  it('returns null for junk', () => {
    expect(classifyPlaceRef('')).toBeNull();
    expect(classifyPlaceRef(undefined)).toBeNull();
  });
});

describe('buildItineraryFromPersistedTripDays', () => {
  it('maps TRANSIT without Place/note to draft label for POI hydration', () => {
    const itin = buildItineraryFromPersistedTripDays('trip-x', [
      {
        date: new Date('2026-06-01T00:00:00.000Z'),
        ItineraryItem: [
          {
            id: 'tr-1',
            type: 'TRANSIT',
            startTime: null,
            endTime: null,
            placeId: null,
            note: null,
            Place: null,
          },
        ],
      },
    ]);
    expect(itin.days[0].items).toHaveLength(1);
    expect(itin.days[0].items[0].type).toBe('POI');
    expect(itin.days[0].items[0].location_ref.name).toBe('交通（草案）');
  });
});

describe('applyRouteRunPoiDisplayNamesToTimeline', () => {
  it('writes display_name into POI location_ref.name', () => {
    const days = [
      {
        items: [
          {
            id: 'item-1',
            type: 'POI' as const,
            start_window: '09:00',
            end_window: '11:00',
            location_ref: { name: 'Krossá River Crossing', place_id: '381112' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ];
    const cards: RouteRunPoiCard[] = [
      {
        place_id: 381112,
        uuid: null,
        itinerary_item_id: 'item-1',
        day_index: 1,
        date: '2026-06-01',
        item_type: 'POI',
        start_window: '09:00',
        end_window: '11:00',
        itinerary_name: 'Krossá River Crossing',
        name_cn: '克罗斯河渡河点',
        name_en: 'Krossá River Crossing',
        display_name: '克罗斯河渡河点',
        category: null,
        rating: null,
        description: null,
        address: null,
        lat: null,
        lng: null,
        tags: [],
        matched_from: 'place_id',
        ontologyRules: null,
        resolved_from_place_registry: true,
      },
    ];
    applyRouteRunPoiDisplayNamesToTimeline(days, cards);
    expect(days[0].items![0].location_ref.name).toBe('克罗斯河渡河点');
  });
});
