/**
 * 预订购物车 UI 契约（tripnara.booking_cart@v1）
 *
 * 从 route_and_run payload 中的航班/酒店/租车快照投影为可一键预订的购物车结构。
 */

export const BOOKING_CART_SCHEMA = 'tripnara.booking_cart@v1' as const;

export type BookingCartItemKind = 'flight' | 'hotel' | 'car_rental' | 'activity';

export interface BookingCartItemUi {
  item_id: string;
  kind: BookingCartItemKind;
  label_zh: string;
  price_label?: string;
  currency?: string;
  date_range?: { start?: string; end?: string };
  /** 外部预订链接或 MCP 深链 */
  href?: string;
  api_action?: {
    method: 'GET' | 'POST';
    path: string;
    body_keys?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface BookingCartUi {
  schema: typeof BOOKING_CART_SCHEMA;
  trip_id?: string;
  items: BookingCartItemUi[];
  total_items: number;
  /** 是否仅为采样报价（非已锁定库存） */
  quote_only: boolean;
  headline_zh?: string;
  computed_at: string;
}

function pickStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function buildBookingCartUi(input: {
  tripId?: string | null;
  flightInventorySnapshot?: Record<string, unknown> | null;
  carRentals?: unknown[] | null;
  accommodations?: unknown[] | null;
  accommodationNightGroups?: unknown[] | null;
}): BookingCartUi | undefined {
  const items: BookingCartItemUi[] = [];

  const flightSnap = input.flightInventorySnapshot;
  if (flightSnap && typeof flightSnap === 'object') {
    const legs = Array.isArray(flightSnap.legs) ? flightSnap.legs : [];
    for (let li = 0; li < legs.length; li++) {
      const leg = legs[li] as Record<string, unknown>;
      const offers = Array.isArray(leg.sample_offers) ? leg.sample_offers : [];
      for (const offer of offers.slice(0, 2)) {
        const o = offer as Record<string, unknown>;
        const rank = typeof o.rank === 'number' ? o.rank : items.length + 1;
        const segs = Array.isArray(o.segments) ? o.segments : [];
        const seg0 = (segs[0] ?? {}) as Record<string, unknown>;
        const label =
          pickStr(o, ['summary_line']) ??
          `${pickStr(seg0, ['departure_airport']) ?? '?'} → ${pickStr(seg0, ['arrival_airport']) ?? '?'}`;
        items.push({
          item_id: `flight_leg${li}_rank${rank}`,
          kind: 'flight',
          label_zh: `航班 · ${label}`,
          price_label: pickStr(o, ['price_total']),
          currency: pickStr(o, ['currency']),
          metadata: { rank, duration: o.duration },
        });
      }
    }
  }

  const accCards: unknown[] = [];
  if (Array.isArray(input.accommodations)) accCards.push(...input.accommodations);
  if (Array.isArray(input.accommodationNightGroups)) {
    for (const ng of input.accommodationNightGroups) {
      const g = ng as Record<string, unknown>;
      const groupNight = g.night_index ?? g.nightIndex;
      if (Array.isArray(g.cards)) {
        for (const raw of g.cards) {
          if (raw && typeof raw === 'object') {
            const c = raw as Record<string, unknown>;
            accCards.push({
              ...c,
              ...(c.night_index == null && c.nightIndex == null && groupNight != null
                ? { night_index: groupNight }
                : {}),
            });
          }
        }
      }
    }
  }
  for (const [i, raw] of accCards.entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const name = pickStr(c, ['name', 'nameCN']) ?? `住宿 ${i + 1}`;
    items.push({
      item_id: pickStr(c, ['id']) ?? `hotel_${i}`,
      kind: 'hotel',
      label_zh: `住宿 · ${name}`,
      price_label: pickStr(c, ['priceLabel', 'price_label']),
      href: pickStr(c, ['url']),
      date_range: {
        start: pickStr(c, ['checkIn', 'check_in']),
        end: pickStr(c, ['checkOut', 'check_out']),
      },
      metadata: {
        night_index: c.nightIndex ?? c.night_index,
        source: c.source,
        ...(c.metadata && typeof c.metadata === 'object' ? (c.metadata as Record<string, unknown>) : {}),
        ...(c.is_luxury_anchor != null ? { is_luxury_anchor: c.is_luxury_anchor } : {}),
        ...(c.is_highlight != null ? { is_highlight: c.is_highlight } : {}),
        ...(c.rating != null ? { rating: c.rating } : {}),
        ...(c.review_score != null ? { review_score: c.review_score } : {}),
        ...(c.stars != null ? { stars: c.stars } : {}),
      },
    });
  }

  const cars = input.carRentals;
  if (Array.isArray(cars)) {
    for (const [i, raw] of cars.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      const name =
        pickStr(c, ['vehicle_name', 'name', 'car_class']) ??
        pickStr(c, ['supplier_name']) ??
        `租车方案 ${i + 1}`;
      items.push({
        item_id: pickStr(c, ['id', 'offer_id']) ?? `car_${i}`,
        kind: 'car_rental',
        label_zh: `租车 · ${name}`,
        price_label: pickStr(c, ['price_total', 'total_price', 'price']),
        currency: pickStr(c, ['currency']),
        href: pickStr(c, ['url', 'booking_url']),
        date_range: {
          start: pickStr(c, ['pickup_date', 'check_in']),
          end: pickStr(c, ['dropoff_date', 'check_out']),
        },
      });
    }
  }

  if (!items.length) return undefined;

  return {
    schema: BOOKING_CART_SCHEMA,
    ...(input.tripId?.trim() ? { trip_id: input.tripId.trim() } : {}),
    items: items.slice(0, 20),
    total_items: items.length,
    quote_only: true,
    headline_zh: `已为您汇总 ${items.length} 项可预订报价（采样库存，下单前请再次确认）`,
    computed_at: new Date().toISOString(),
  };
}
