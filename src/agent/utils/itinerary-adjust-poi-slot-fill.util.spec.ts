import {
  allNewPoiItemsHavePlaceIds,
  buildPoiSlotFillAppendEdits,
  collectSparseTripDayTargets,
  detectPoiSlotFillIntent,
  enrichItineraryWithPlaceIdsFromResearch,
  extractNewPoiItemsForSparseDay,
  mergePoiSlotFillOrchestratorItinerary,
} from './itinerary-adjust-poi-slot-fill.util';
import { classifyItineraryAdjustSubIntent, resolveItineraryAdjustExecutionMode } from './itinerary-adjust-auto-apply.util';
import type { ItineraryDay } from '../interfaces/trip-plan.interface';

const TRIP_RANGE = { start_date: '2026-11-01', end_date: '2026-11-06' };

describe('itinerary-adjust-poi-slot-fill', () => {
  it('detects recommend-add POI slot fill intent', () => {
    expect(detectPoiSlotFillIntent('根据我的行程，推荐一些适合加入的景点', TRIP_RANGE)).toBe(
      true,
    );
    expect(classifyItineraryAdjustSubIntent('根据我的行程，推荐一些适合加入的景点')).toBe(
      'poi_slot_fill',
    );
  });

  it('does not classify strong replan as poi slot fill', () => {
    expect(
      detectPoiSlotFillIntent('帮我把第二天重新规划一下，现在明显不合理', TRIP_RANGE),
    ).toBe(false);
    expect(
      classifyItineraryAdjustSubIntent('帮我把第二天重新规划一下，现在明显不合理'),
    ).toBe('strong_modification');
  });

  it('does not classify specific POI add as poi slot fill', () => {
    expect(detectPoiSlotFillIntent('第3天，新增斯卡夫塔山国家公园poi', TRIP_RANGE)).toBe(false);
  });

  it('collects sparse trip days with at most one activity', () => {
    const targets = collectSparseTripDayTargets({
      TripDay: [
        {
          id: 'd1',
          date: '2026-11-01',
          ItineraryItem: [{ id: 'h1', placeId: 1, Place: { id: 1, nameCN: '酒店' } }],
        },
        {
          id: 'd2',
          date: '2026-11-02',
          ItineraryItem: [
            { id: 'a1', placeId: 10, Place: { id: 10, nameCN: '塞里雅兰瀑布' } },
            { id: 'a2', placeId: 11, Place: { id: 11, nameCN: '斯科加瀑布' } },
          ],
        },
        { id: 'd3', date: '2026-11-03', ItineraryItem: [] },
      ],
    });
    expect(targets.map((t) => t.dateIso)).toEqual(['2026-11-01', '2026-11-03']);
  });

  it('enriches itinerary items with place_id from research pools', () => {
    const itinerary = {
      request_id: 'r1',
      days: [
        {
          date: '2026-11-03',
          items: [
            {
              id: 'n1',
              type: 'POI' as const,
              start_window: '09:00',
              end_window: '12:00',
              location_ref: { name: '众神瀑布' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    const bound = enrichItineraryWithPlaceIdsFromResearch(itinerary, [
      [{ name: '众神瀑布', poi_id: '201' }],
    ]);
    expect(bound).toBe(1);
    expect(itinerary.days[0].items[0].location_ref?.place_id).toBe('201');
  });

  it('extracts only new draft POIs not already on trip day', () => {
    const draftDay: ItineraryDay = {
      date: '2026-11-03',
      items: [
        {
          id: 'd1',
          type: 'POI',
          start_window: '09:00',
          end_window: '11:00',
          location_ref: { name: '塞里雅兰瀑布', place_id: '10' },
          evidence_refs: [],
          verified: false,
        },
        {
          id: 'd2',
          type: 'POI',
          start_window: '13:00',
          end_window: '15:00',
          location_ref: { name: '黑沙滩', place_id: '20' },
          evidence_refs: [],
          verified: false,
        },
      ],
    };
    const existing = [{ id: 'a1', placeId: 10, Place: { id: 10, nameCN: '塞里雅兰瀑布' } }];
    const newItems = extractNewPoiItemsForSparseDay(draftDay, existing);
    expect(newItems).toHaveLength(1);
    expect(newItems[0].location_ref?.name).toBe('黑沙滩');
  });

  it('builds append-only edits for sparse days', () => {
    const trip = {
      TripDay: [
        { id: 'day-3', date: '2026-11-03', ItineraryItem: [] },
      ],
    };
    const draftDays: ItineraryDay[] = [
      {
        date: '2026-11-03',
        items: [
          {
            id: 'n1',
            type: 'POI',
            start_window: '09:00',
            end_window: '12:00',
            location_ref: { name: '钻石沙滩', place_id: '301' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ];
    const { edits, addCount, unresolvedItems } = buildPoiSlotFillAppendEdits({
      trip,
      sparseTargets: [{ dateIso: '2026-11-03', dayNumber: 3, existingActivityCount: 0 }],
      draftDays,
      resolvePlaceId: (item) => Number(item.location_ref?.place_id),
    });
    expect(unresolvedItems).toHaveLength(0);
    expect(addCount).toBe(1);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ type: 'add', tripDayId: 'day-3', placeId: 301 });
  });

  it('resolves SEMI_AUTO when all new POIs have place_id', () => {
    const trip = {
      TripDay: [{ id: 'd3', date: '2026-11-03', ItineraryItem: [] }],
    };
    const draftDays: ItineraryDay[] = [
      {
        date: '2026-11-03',
        items: [
          {
            id: 'n1',
            type: 'POI',
            start_window: '09:00',
            end_window: '12:00',
            location_ref: { name: '冰河湖', place_id: '401' },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ];
    expect(
      allNewPoiItemsHavePlaceIds(draftDays, [
        { dateIso: '2026-11-03', dayNumber: 3, existingActivityCount: 0 },
      ], trip),
    ).toBe(true);
    expect(
      resolveItineraryAdjustExecutionMode({
        subIntent: 'poi_slot_fill',
        highConfidence: false,
        poiSlotFillReady: true,
      }),
    ).toBe('SEMI_AUTO');
  });

  it('merges orchestrator draft with trip for sparse days only', () => {
    const trip = {
      TripDay: [
        {
          id: 'd2',
          date: '2026-11-02',
          ItineraryItem: [
            { id: 'a1', placeId: 10, Place: { id: 10, nameCN: '塞里雅兰瀑布' } },
          ],
        },
        { id: 'd3', date: '2026-11-03', ItineraryItem: [] },
      ],
    };
    const orchestrator = {
      request_id: 'r1',
      days: [
        {
          date: '2026-11-02',
          items: [
            {
              id: 'x1',
              type: 'POI' as const,
              location_ref: { name: '全新景点' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
        {
          date: '2026-11-03',
          items: [
            {
              id: 'n1',
              type: 'POI' as const,
              start_window: '10:00',
              end_window: '12:00',
              location_ref: { name: '冰河湖', place_id: '401' },
              evidence_refs: [],
              verified: false,
            },
          ],
        },
      ],
    };
    const merged = mergePoiSlotFillOrchestratorItinerary({
      orchestrator,
      trip,
      sparseTargets: [{ dateIso: '2026-11-03', dayNumber: 3, existingActivityCount: 0 }],
    });
    const day2 = merged?.days.find((d) => d.date === '2026-11-02');
    const day3 = merged?.days.find((d) => d.date === '2026-11-03');
    expect(day2?.items.some((it) => it.location_ref?.name === '塞里雅兰瀑布')).toBe(true);
    expect(day2?.items.some((it) => it.location_ref?.name === '全新景点')).toBe(false);
    expect(day3?.items.some((it) => it.location_ref?.name === '冰河湖')).toBe(true);
  });
});
