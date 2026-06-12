import { BOOKING_CHECKOUT_BUNDLE_SCHEMA } from '../types/booking-checkout-bundle.type';
import { lockBookingCheckoutBundle } from './booking-cart-bundle-lock.util';
import { buildBookingCartUi } from '../../utils/booking-cart-ui.util';
import { optimizeBookingCartUi } from '../../utils/booking-cart-optimizer.util';

describe('booking-cart-bundle-lock.util', () => {
  it('为选中条目生成 Bundle 锁价凭证', async () => {
    const raw = buildBookingCartUi({
      tripId: 'trip-1',
      carRentals: [
        {
          id: 'c1',
          vehicle_name: 'SUV',
          price_total: '¥3000',
          href: 'https://book.example/c1',
        },
      ],
    })!;
    const cart = optimizeBookingCartUi(raw, { total: 10000 });
    const ready = optimizeBookingCartUi(
      { ...cart, cart_state: 'ready_to_checkout' },
      { total: 10000 },
    );

    const bundle = await lockBookingCheckoutBundle({ cart: ready, tripId: 'trip-1' });
    expect(bundle.schema).toBe(BOOKING_CHECKOUT_BUNDLE_SCHEMA);
    expect(bundle.lines.length).toBeGreaterThan(0);
    expect(bundle.lines[0].lock_status).toMatch(/LOCKED|QUOTE_ONLY/);
    expect(bundle.total_locked_price_numeric).toBeGreaterThan(0);
    expect(bundle.expires_at > bundle.locked_at).toBe(true);
  });
});
