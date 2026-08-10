import {
  enrichHotelRouteRunUiForClientApply,
  enrichRouteRunCardForClientApply,
  mapHotelRouteRunUiToAccommodationItems,
} from './route-run-accommodation-apply.util';
import type { HotelRouteRunUiPayload } from './hotel-mcp-route-run.mapper';

describe('route-run-accommodation-apply.util', () => {
  const baseUi: HotelRouteRunUiPayload = {
    accommodations: [
      {
        id: 'stay-1',
        source: 'airbnb',
        name: 'Near Vik',
        nightIndex: 1,
        url: 'https://airbnb.com/rooms/1',
      },
      {
        id: 'stay-2',
        source: 'hotel',
        name: 'Hotel Hofn',
        nightIndex: 2,
      },
    ],
    airbnbListings: [],
    routing: { target: 'hotel' },
    night_groups: [
      {
        night_index: 1,
        check_in: '2026-06-02',
        check_out: '2026-06-03',
        anchor_label_zh: '维克',
        stay_label_zh: '住1晚（06/02—06/03）',
        has_mcp_sample: true,
        cards: [],
      },
      {
        night_index: 2,
        check_in: '2026-06-03',
        check_out: '2026-06-04',
        anchor_label_zh: '赫本',
        stay_label_zh: '住1晚（06/03—06/04）',
        has_mcp_sample: true,
        cards: [],
      },
    ],
  };

  it('enrichHotelRouteRunUiForClientApply adds checkIn/checkOut and apply actions', () => {
    const enriched = enrichHotelRouteRunUiForClientApply(baseUi);
    expect(enriched.accommodations[0].checkIn).toBe('2026-06-02');
    expect(enriched.accommodations[0].checkOut).toBe('2026-06-03');
    expect(enriched.accommodations[0].actions?.some((a) => a.action === 'add_accommodation_to_itinerary')).toBe(
      true,
    );
    const addAction = enriched.accommodations[0].actions?.find(
      (a) => a.action === 'add_accommodation_to_itinerary',
    );
    expect(addAction?.params).toEqual(
      expect.objectContaining({
        accommodationIndex: 0,
        applySnapshot: expect.objectContaining({ name: 'Near Vik' }),
      }),
    );
    expect(enriched.accommodations[1].checkIn).toBe('2026-06-03');
  });

  it('mapHotelRouteRunUiToAccommodationItems produces apply-ready DTOs', () => {
    const items = mapHotelRouteRunUiToAccommodationItems(baseUi);
    expect(items).toHaveLength(2);
    expect(items[0].checkIn).toBe('2026-06-02');
    expect(items[0].url).toBe('https://airbnb.com/rooms/1');
    expect(items[0].nightIndex).toBe(1);
    expect(items[0].actions?.length).toBeGreaterThan(0);
  });

  it('enrichRouteRunCardForClientApply keeps checkIn when already on card', () => {
    const card = enrichRouteRunCardForClientApply(
      {
        id: 'x',
        source: 'hotel',
        name: 'Test',
        nightIndex: 3,
        checkIn: '2026-06-04',
        checkOut: '2026-06-05',
      },
      0,
    );
    expect(card.checkIn).toBe('2026-06-04');
    expect(card.checkOut).toBe('2026-06-05');
  });

  it('enrich fliggy card: primary CTA is 加入行程, view is secondary', () => {
    const card = enrichRouteRunCardForClientApply(
      {
        id: '78309218',
        source: 'fliggy',
        name: '汉庭康定',
        url: 'https://router.feizhu.com/h/1',
        webUrl: 'https://router.feizhu.com/h/1',
        bookingProvider: 'fliggy',
        bookingCtaLabelZh: '去飞猪查看',
        checkIn: '2026-06-02',
        checkOut: '2026-06-03',
      },
      0,
    );
    expect(card.cta_zh).toBe('加入行程');
    expect(card.primary_action?.action).toBe('add_accommodation_to_itinerary');
    expect(card.actions?.[0]?.action).toBe('add_accommodation_to_itinerary');
    expect(card.actions?.some((a) => a.action === 'view_accommodation')).toBe(true);
    expect(
      card.actions?.find((a) => a.action === 'view_accommodation')?.labelCN,
    ).toBe('去飞猪查看');
  });
});
