import { injectCorridorDriveLegsIntoDayItems, injectCorridorDriveLegsIntoDays, normalizeForRouteTagging } from './itinerary-segment-tagger.util';

describe('itinerary-segment-tagger.util', () => {
  it('normalizeForRouteTagging lowercases and trims', () => {
    expect(normalizeForRouteTagging('  Akureyri  ')).toBe('akureyri');
  });

  it('inserts DRIVE with ring-road:vik-jokulsarlon between Vík and Jökulsárlón POIs', () => {
    const items = injectCorridorDriveLegsIntoDayItems(
      [
        {
          id: 'p1',
          type: 'POI',
          start_window: '09:00',
          end_window: '11:00',
          location_ref: { place_id: 'poi-vik', name: 'Vík' },
          evidence_refs: [],
          verified: false,
        },
        {
          id: 'p2',
          type: 'POI',
          start_window: '14:00',
          end_window: '16:00',
          location_ref: { place_id: 'poi-jok', name: 'Jökulsárlón' },
          evidence_refs: [],
          verified: false,
        },
      ] as any,
      'req-test',
      '2026-07-01',
    );
    expect(items.length).toBe(3);
    const drive = items.find((x: any) => x.type === 'DRIVE');
    expect(drive?.metadata?.route_segment_ref).toBe('ring-road:vik-jokulsarlon');
  });

  it('inserts DRIVE for Akureyri ↔ Mývatn (north corridor)', () => {
    const items = injectCorridorDriveLegsIntoDayItems(
      [
        {
          id: 'a',
          type: 'POI',
          start_window: '09:00',
          end_window: '12:00',
          location_ref: { place_id: 'poi-ak', name: 'Akureyri' },
          evidence_refs: [],
          verified: false,
        },
        {
          id: 'm',
          type: 'POI',
          start_window: '14:00',
          end_window: '17:00',
          location_ref: { place_id: 'poi-myv', name: 'Lake Mývatn' },
          evidence_refs: [],
          verified: false,
        },
      ] as any,
      'req-n',
      '2026-07-03',
    );
    const drive = items.find((x: any) => x.type === 'DRIVE');
    expect(drive?.metadata?.route_segment_ref).toBe('ring-road:north-myvatn-corridor');
  });

  it('injectCorridorDriveLegsIntoDays processes each day', () => {
    const days = injectCorridorDriveLegsIntoDays(
      [
        {
          date: '2026-07-01',
          items: [
            {
              id: 'x',
              type: 'POI',
              start_window: '09:00',
              end_window: '10:00',
              location_ref: { name: 'Vík' },
              evidence_refs: [],
              verified: false,
            },
            {
              id: 'y',
              type: 'POI',
              start_window: '12:00',
              end_window: '13:00',
              location_ref: { name: 'Jökulsárlón' },
              evidence_refs: [],
              verified: false,
            },
          ] as any,
        },
      ],
      'r1',
    );
    expect(days[0].items.filter((i: any) => i.type === 'DRIVE').length).toBe(1);
  });
});
