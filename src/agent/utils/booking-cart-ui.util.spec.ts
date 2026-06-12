import { BOOKING_CART_SCHEMA, buildBookingCartUi } from './booking-cart-ui.util';

describe('booking-cart-ui.util', () => {
  it('buildBookingCartUi 无预订快照时返回 undefined', () => {
    expect(buildBookingCartUi({ tripId: 't1' })).toBeUndefined();
  });

  it('buildBookingCartUi 投影航班/酒店/租车条目', () => {
    const cart = buildBookingCartUi({
      tripId: 'trip-abc',
      flightInventorySnapshot: {
        legs: [
          {
            sample_offers: [
              {
                rank: 1,
                price_total: '¥12,800',
                currency: 'JPY',
                segments: [{ departure_airport: 'PEK', arrival_airport: 'NRT' }],
              },
            ],
          },
        ],
      },
      accommodations: [{ id: 'h1', name: 'Hotel A', priceLabel: '¥800/晚', checkIn: '2026-09-01' }],
      carRentals: [{ id: 'c1', vehicle_name: 'Toyota Yaris', price_total: '¥4500', currency: 'JPY' }],
    });

    expect(cart?.schema).toBe(BOOKING_CART_SCHEMA);
    expect(cart?.trip_id).toBe('trip-abc');
    expect(cart?.quote_only).toBe(true);
    expect(cart?.items.some((i) => i.kind === 'flight')).toBe(true);
    expect(cart?.items.some((i) => i.kind === 'hotel' && i.label_zh.includes('Hotel A'))).toBe(true);
    expect(cart?.items.some((i) => i.kind === 'car_rental')).toBe(true);
    expect(cart?.total_items).toBeGreaterThanOrEqual(3);
  });

  it('buildBookingCartUi 从 accommodation_night_groups 展开卡片', () => {
    const cart = buildBookingCartUi({
      accommodationNightGroups: [
        { night_index: 1, cards: [{ id: 'ng1', name: 'Night Hotel', price_label: '¥600' }] },
      ],
    });
    expect(cart?.items.some((i) => i.label_zh.includes('Night Hotel'))).toBe(true);
  });
});
