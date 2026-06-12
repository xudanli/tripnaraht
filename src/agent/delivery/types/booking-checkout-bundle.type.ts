/**
 * Checkout Bundle 结算单（tripnara.booking_checkout_bundle@v1）
 *
 * submit_checkout 经 MCP/结构化锁价后输出的多品类 Bundle，替代纯 href 深链列表。
 */

import type { BookingCartItemKind } from '../../utils/booking-cart-ui.util';

export const BOOKING_CHECKOUT_BUNDLE_SCHEMA = 'tripnara.booking_checkout_bundle@v1' as const;

export type BookingCheckoutLockStatus = 'LOCKED' | 'QUOTE_ONLY' | 'LOCK_FAILED';

export type BookingCheckoutMcpSource =
  | 'booking_com_car'
  | 'hotel_mcp'
  | 'flight_inventory_snapshot'
  | 'external_deeplink';

export interface BookingCheckoutBundleLine {
  item_id: string;
  kind: BookingCartItemKind;
  label_zh: string;
  lock_id: string;
  lock_status: BookingCheckoutLockStatus;
  lock_expires_at: string;
  locked_price_numeric: number;
  currency?: string;
  href?: string;
  api_action?: { method: 'GET' | 'POST'; path: string; body_keys?: string[] };
  source_mcp?: BookingCheckoutMcpSource;
  /** MCP 锁价失败时的可读原因 */
  lock_detail_zh?: string;
}

export interface BookingCheckoutBundle {
  schema: typeof BOOKING_CHECKOUT_BUNDLE_SCHEMA;
  bundle_id: string;
  trip_id?: string;
  locked_at: string;
  /** 全 Bundle 最早过期时间（ISO） */
  expires_at: string;
  lines: BookingCheckoutBundleLine[];
  total_locked_price_numeric: number;
  currency?: string;
  /** false = 至少一项已 LOCKED，可展示「锁定价格」而非纯采样 */
  quote_only: boolean;
  disclaimer_zh: string;
}
