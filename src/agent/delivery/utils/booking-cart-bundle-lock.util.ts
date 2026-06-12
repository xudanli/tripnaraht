/**
 * 预订购物车 Bundle 锁价（checkout submit 阶段）
 *
 * Phase-4d：对选中条目生成 TTL 锁价凭证；租车可走 Booking.com 重采样校验。
 */

import type { BookingCartItemUi } from '../../utils/booking-cart-ui.util';
import { parseBookingPriceLabel } from '../../utils/booking-cart-optimizer.util';
import type { OptimizedBookingCartUi } from '../../utils/booking-cart-optimizer.util';
import type {
  BookingCheckoutBundle,
  BookingCheckoutBundleLine,
  BookingCheckoutLockStatus,
  BookingCheckoutMcpSource,
} from '../types/booking-checkout-bundle.type';
import { BOOKING_CHECKOUT_BUNDLE_SCHEMA } from '../types/booking-checkout-bundle.type';

export const DEFAULT_BUNDLE_LOCK_TTL_SECONDS = 15 * 60;

export interface CarRentalRefreshHit {
  id: string;
  price_numeric: number;
  currency?: string;
  vehicle_type?: string;
  pickup_location?: { lat?: number; lng?: number; address?: string };
  dropoff_location?: { lat?: number; lng?: number; address?: string };
}

export interface LockBookingCheckoutBundleInput {
  cart: OptimizedBookingCartUi;
  tripId?: string;
  lockTtlSeconds?: number;
  /** 租车 MCP 重采样（Booking.com search 结果行） */
  refreshCarRentalById?: (rentalId: string) => Promise<CarRentalRefreshHit | null>;
}

function isoInSeconds(seconds: number): string {
  return new Date(Date.now() + Math.max(0, seconds) * 1000).toISOString();
}

function itemById(cart: OptimizedBookingCartUi, id: string): BookingCartItemUi | undefined {
  return cart.items.find((i) => i.item_id === id);
}

function resolveMcpSource(item: BookingCartItemUi): BookingCheckoutMcpSource {
  if (item.kind === 'car_rental') return 'booking_com_car';
  if (item.kind === 'hotel') return 'hotel_mcp';
  if (item.kind === 'flight') return 'flight_inventory_snapshot';
  return 'external_deeplink';
}

function resolveSupplierId(item: BookingCartItemUi): string | undefined {
  const meta = item.metadata ?? {};
  const raw =
    meta.supplier_offer_id ??
    meta.offer_id ??
    meta.rental_id ??
    meta.listing_id ??
    item.item_id;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

async function lockLine(
  item: BookingCartItemUi,
  params: {
    tripId?: string;
    lockTtlSeconds: number;
    refreshCarRentalById?: LockBookingCheckoutBundleInput['refreshCarRentalById'];
  },
): Promise<BookingCheckoutBundleLine> {
  const expiresAt = isoInSeconds(params.lockTtlSeconds);
  const lockId = `bndl_${params.tripId ?? 'trip'}_${item.item_id}_${Date.now()}`;
  let price = parseBookingPriceLabel(item.price_label) ?? 0;
  let currency = item.currency?.trim() || undefined;
  let lockStatus: BookingCheckoutLockStatus = 'QUOTE_ONLY';
  let lockDetailZh: string | undefined;
  let href = item.href;
  let apiAction = item.api_action;

  if (item.kind === 'car_rental' && params.refreshCarRentalById) {
    const supplierId = resolveSupplierId(item);
    if (supplierId) {
      try {
        const refreshed = await params.refreshCarRentalById(supplierId);
        if (refreshed && refreshed.price_numeric > 0) {
          price = refreshed.price_numeric;
          currency = refreshed.currency ?? currency;
          lockStatus = 'LOCKED';
          lockDetailZh = '租车报价已通过 Booking.com 实时重采样校验';
          apiAction = {
            method: 'POST',
            path: '/mcp/booking-com/car-rentals/hold',
            body_keys: ['rental_id', 'trip_id', 'lock_id'],
          };
        } else {
          lockStatus = 'LOCK_FAILED';
          lockDetailZh = '租车供应商未返回可锁定报价，请跳转外部链接手动预订';
        }
      } catch {
        lockStatus = 'QUOTE_ONLY';
        lockDetailZh = '租车实时校验暂不可用，保留采样报价';
      }
    }
  }

  if (item.kind === 'hotel') {
    const meta = item.metadata ?? {};
    if (meta.listing_id || meta.place_id || item.href) {
      lockStatus = price > 0 ? 'LOCKED' : 'QUOTE_ONLY';
      apiAction = apiAction ?? {
        method: 'POST',
        path: '/mcp/hotel/hold',
        body_keys: ['listing_id', 'check_in', 'check_out', 'trip_id', 'lock_id'],
      };
      lockDetailZh = lockStatus === 'LOCKED' ? '住宿采样价已生成短时锁价凭证' : undefined;
    }
  }

  if (item.kind === 'flight' && price > 0) {
    lockStatus = 'LOCKED';
    apiAction = apiAction ?? {
      method: 'POST',
      path: '/mcp/flight/hold',
      body_keys: ['offer_ref', 'trip_id', 'lock_id'],
    };
    lockDetailZh = '航班采样报价已锁定（下单前请再次核对舱位）';
  }

  if (price <= 0) {
    lockStatus = 'LOCK_FAILED';
    lockDetailZh = '无法解析有效价格，请重新 route_and_run 刷新报价';
  }

  return {
    item_id: item.item_id,
    kind: item.kind,
    label_zh: item.label_zh,
    lock_id: lockId,
    lock_status: lockStatus,
    lock_expires_at: expiresAt,
    locked_price_numeric: price,
    ...(currency ? { currency } : {}),
    ...(href ? { href } : {}),
    ...(apiAction ? { api_action: apiAction } : {}),
    source_mcp: resolveMcpSource(item),
    ...(lockDetailZh ? { lock_detail_zh: lockDetailZh } : {}),
  };
}

export async function lockBookingCheckoutBundle(
  input: LockBookingCheckoutBundleInput,
): Promise<BookingCheckoutBundle> {
  const ttl = input.lockTtlSeconds ?? DEFAULT_BUNDLE_LOCK_TTL_SECONDS;
  const lockedAt = new Date().toISOString();
  const selectedIds = input.cart.selection?.selected_item_ids ?? [];
  const lines: BookingCheckoutBundleLine[] = [];

  for (const id of selectedIds) {
    const item = itemById(input.cart, id);
    if (!item) continue;
    lines.push(
      await lockLine(item, {
        tripId: input.tripId ?? input.cart.trip_id,
        lockTtlSeconds: ttl,
        refreshCarRentalById: input.refreshCarRentalById,
      }),
    );
  }

  const expiresAt = lines.length
    ? lines.reduce((min, l) => (l.lock_expires_at < min ? l.lock_expires_at : min), lines[0].lock_expires_at)
    : isoInSeconds(ttl);

  const total = lines.reduce((s, l) => s + l.locked_price_numeric, 0);
  const currency =
    lines.find((l) => l.currency?.trim())?.currency ??
    input.cart.selection?.currency ??
    input.cart.budget?.currency;

  const allLocked = lines.length > 0 && lines.every((l) => l.lock_status === 'LOCKED');
  const anyFailed = lines.some((l) => l.lock_status === 'LOCK_FAILED');

  return {
    schema: BOOKING_CHECKOUT_BUNDLE_SCHEMA,
    bundle_id: `bundle_${input.tripId ?? input.cart.trip_id ?? 'cart'}_${Date.now()}`,
    ...(input.tripId || input.cart.trip_id
      ? { trip_id: input.tripId ?? input.cart.trip_id }
      : {}),
    locked_at: lockedAt,
    expires_at: expiresAt,
    lines,
    total_locked_price_numeric: total,
    ...(currency ? { currency } : {}),
    quote_only: !allLocked,
    disclaimer_zh: allLocked
      ? 'Bundle 价格已在短时锁价窗口内锁定；请在过期前完成外部支付。'
      : anyFailed
        ? '部分品类未能锁定实时库存，标有 LOCK_FAILED 的条目请手动跳转预订。'
        : '部分条目仍为采样报价（QUOTE_ONLY），跳转供应商前请再次核对价格。',
  };
}
