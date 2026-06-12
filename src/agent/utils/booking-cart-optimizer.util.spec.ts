import { BOOKING_CART_SCHEMA, buildBookingCartUi } from './booking-cart-ui.util';
import {
  optimizeBookingCartUi,
  parseBookingPriceLabel,
} from './booking-cart-optimizer.util';

describe('booking-cart-optimizer.util', () => {
  it('parseBookingPriceLabel 解析常见报价格式', () => {
    expect(parseBookingPriceLabel('¥12,800')).toBe(12800);
    expect(parseBookingPriceLabel('JPY 4500')).toBe(4500);
    expect(parseBookingPriceLabel(undefined)).toBeUndefined();
  });

  it('optimizeBookingCartUi 无预算时为 draft 并预选各 slot 最低价', () => {
    const cart = buildBookingCartUi({
      tripId: 't1',
      flightInventorySnapshot: {
        legs: [
          {
            sample_offers: [
              { rank: 1, price_total: '¥15,000', currency: 'JPY' },
              { rank: 2, price_total: '¥12,000', currency: 'JPY' },
            ],
          },
        ],
      },
      carRentals: [
        { id: 'c1', vehicle_name: 'SUV', price_total: '¥8000' },
        { id: 'c2', vehicle_name: 'Economy', price_total: '¥4500' },
      ],
    })!;

    const out = optimizeBookingCartUi(cart);
    expect(out.cart_state).toBe('draft');
    expect(out.selection?.selected_item_ids).toContain('flight_leg0_rank2');
    expect(out.selection?.selected_item_ids).toContain('c2');
    expect(out.selection?.total_price_numeric).toBe(12000 + 4500);
  });

  it('optimizeBookingCartUi 预算内为 optimized', () => {
    const cart = buildBookingCartUi({
      carRentals: [{ id: 'c1', vehicle_name: 'Economy', price_total: '¥3000', currency: 'CNY' }],
    })!;

    const out = optimizeBookingCartUi(cart, { total: 10000, currency: 'CNY' });
    expect(out.cart_state).toBe('optimized');
    expect(out.selection?.within_budget).toBe(true);
    expect(out.budget?.limit).toBe(10000);
    expect(out.headline_zh).toContain('预算内');
  });

  it('optimizeBookingCartUi 超预算时给出换选建议', () => {
    const cart = buildBookingCartUi({
      flightInventorySnapshot: {
        legs: [
          {
            sample_offers: [
              { rank: 1, price_total: '¥20,000' },
              { rank: 2, price_total: '¥8,000' },
            ],
          },
        ],
      },
      accommodations: [{ id: 'h1', name: 'Luxury', priceLabel: '¥12,000' }],
    })!;

    const out = optimizeBookingCartUi(cart, { total: 15000 });
    expect(out.cart_state).toBe('over_budget');
    expect(out.selection?.within_budget).toBe(false);
    expect(out.savings_opportunities?.length).toBeGreaterThan(0);
    expect(out.headline_zh).toContain('超出预算');
  });

  it('optimizeBookingCartUi 按 night_index 每晚独立选最低价', () => {
    const cart = buildBookingCartUi({
      accommodationNightGroups: [
        {
          night_index: 1,
          cards: [
            { id: 'h1a', name: 'Hotel A Premium', price_label: '¥1200' },
            { id: 'h1b', name: 'Hotel A Budget', price_label: '¥600' },
          ],
        },
        {
          night_index: 2,
          cards: [
            { id: 'h2a', name: 'Hotel B Premium', price_label: '¥900' },
            { id: 'h2b', name: 'Hotel B Budget', price_label: '¥500' },
          ],
        },
      ],
    })!;

    const out = optimizeBookingCartUi(cart, { total: 2000 });
    expect(out.selection?.selected_item_ids).toEqual(['h1b', 'h2b']);
    expect(out.selection?.total_price_numeric).toBe(1100);
    expect(out.cart_state).toBe('optimized');
  });
});

describe('booking-cart-ui.util', () => {
  it('buildBookingCartUi schema 常量', () => {
    expect(BOOKING_CART_SCHEMA).toBe('tripnara.booking_cart@v1');
  });
});
