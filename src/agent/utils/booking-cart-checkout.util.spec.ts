import { BOOKING_CART_SCHEMA, buildBookingCartUi } from './booking-cart-ui.util';
import { optimizeBookingCartUi } from './booking-cart-optimizer.util';
import { applyBookingCartAction } from './booking-cart-checkout.util';

function sampleCart() {
  const raw = buildBookingCartUi({
    tripId: 'trip-1',
    flightInventorySnapshot: {
      legs: [
        {
          sample_offers: [
            { rank: 1, price_total: '¥15,000' },
            { rank: 2, price_total: '¥10,000' },
          ],
        },
      ],
    },
    carRentals: [{ id: 'c1', vehicle_name: 'Economy', price_total: '¥3000', href: 'https://book.example/c1' }],
  })!;
  return optimizeBookingCartUi(raw, { total: 15000 });
}

describe('booking-cart-checkout.util', () => {
  it('update_selection 校验 slot 唯一性', () => {
    const cart = sampleCart();
    const res = applyBookingCartAction({
      cart,
      action: 'update_selection',
      payload: { selected_item_ids: ['flight_leg0_rank1', 'flight_leg0_rank2'] },
    });
    expect(res.status).toBe('REJECTED');
    expect(res.rejection_reason_zh).toContain('同一品类');
  });

  it('update_selection 重算 within_budget', () => {
    const cart = sampleCart();
    const res = applyBookingCartAction({
      cart,
      action: 'update_selection',
      payload: { selected_item_ids: ['flight_leg0_rank1', 'c1'] },
    });
    expect(res.status).toBe('OK');
    expect(res.booking_cart.selection?.within_budget).toBe(false);
    expect(res.booking_cart.cart_state).toBe('over_budget');
  });

  it('apply_saving 换选更便宜航班', () => {
    let cart = sampleCart();
    cart = applyBookingCartAction({
      cart,
      action: 'update_selection',
      payload: { selected_item_ids: ['flight_leg0_rank1', 'c1'] },
    }).booking_cart;
    const savingIdx = cart.savings_opportunities?.findIndex((s) => s.from_item_id === 'flight_leg0_rank1');
    expect(savingIdx).toBeGreaterThanOrEqual(0);

    const res = applyBookingCartAction({
      cart,
      action: 'apply_saving',
      payload: { saving_index: savingIdx },
    });
    expect(res.status).toBe('OK');
    expect(res.booking_cart.selection?.selected_item_ids).toContain('flight_leg0_rank2');
    expect(res.booking_cart.selection?.within_budget).toBe(true);
  });

  it('confirm_ready 超预算需 acknowledge', () => {
    const cart = applyBookingCartAction({
      cart: sampleCart(),
      action: 'update_selection',
      payload: { selected_item_ids: ['flight_leg0_rank1', 'c1'] },
    }).booking_cart;

    const rejected = applyBookingCartAction({
      cart,
      action: 'confirm_ready',
    });
    expect(rejected.status).toBe('REJECTED');

    const ok = applyBookingCartAction({
      cart,
      action: 'confirm_ready',
      payload: { acknowledge_over_budget: true },
    });
    expect(ok.status).toBe('OK');
    expect(ok.booking_cart.cart_state).toBe('ready_to_checkout');
    expect(ok.checkout?.status).toBe('ready');
    expect(ok.checkout?.deep_links.length).toBe(2);
  });

  it('submit_checkout 需先 confirm_ready', () => {
    const cart = sampleCart();
    const rejected = applyBookingCartAction({ cart, action: 'submit_checkout' });
    expect(rejected.status).toBe('REJECTED');

    const ready = applyBookingCartAction({ cart, action: 'confirm_ready' }).booking_cart;
    const submitted = applyBookingCartAction({ cart: ready, action: 'submit_checkout' });
    expect(submitted.status).toBe('OK');
    expect(submitted.booking_cart.cart_state).toBe('checkout_submitted');
    expect(submitted.checkout?.status).toBe('submitted');
    expect(submitted.booking_cart.schema).toBe(BOOKING_CART_SCHEMA);
  });
});
