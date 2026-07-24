/**
 * 预订购物车 checkout 状态流转（tripnara.booking_cart@v1 actions）
 */

import type { BookingCheckoutBundle } from '../delivery/types/booking-checkout-bundle.type';
import {
  lockBookingCheckoutBundle,
  type LockBookingCheckoutBundleInput,
} from '../delivery/utils/booking-cart-bundle-lock.util';
import type { BookingCartItemUi } from './booking-cart-ui.util';
import {
  buildSavingsOpportunities,
  groupItemsBySlot,
  parseBookingPriceLabel,
  type BookingCartState,
  type OptimizedBookingCartUi,
} from './booking-cart-optimizer.util';

export type BookingCartAction =
  | 'update_selection'
  | 'apply_saving'
  | 'confirm_ready'
  | 'submit_checkout';

export interface BookingCartCheckoutLineUi {
  item_id: string;
  kind: BookingCartItemUi['kind'];
  label_zh: string;
  href?: string;
  api_action?: BookingCartItemUi['api_action'];
  price_label?: string;
}

export interface BookingCartCheckoutResultUi {
  status: 'ready' | 'submitted';
  deep_links: BookingCartCheckoutLineUi[];
  disclaimer_zh: string;
  /** submit_checkout 锁价后的 Bundle 结算单 */
  bundle?: BookingCheckoutBundle;
}

export interface ApplyBookingCartActionInput {
  cart: OptimizedBookingCartUi;
  action: BookingCartAction;
  payload?: {
    selected_item_ids?: string[];
    saving_index?: number;
    acknowledge_over_budget?: boolean;
  };
  /** submit_checkout：租车 MCP 重采样（由 AgentService 注入） */
  refreshCarRentalById?: LockBookingCheckoutBundleInput['refreshCarRentalById'];
  tripId?: string;
}

export interface ApplyBookingCartActionResult {
  status: 'OK' | 'REJECTED';
  booking_cart: OptimizedBookingCartUi;
  checkout?: BookingCartCheckoutResultUi;
  rejection_reason_zh?: string;
}

function itemById(cart: OptimizedBookingCartUi, id: string): BookingCartItemUi | undefined {
  return cart.items.find((i) => i.item_id === id);
}

function slotKeyForItem(item: BookingCartItemUi): string {
  const groups = groupItemsBySlot([item]);
  return [...groups.keys()][0] ?? `other_${item.item_id}`;
}

function validateSelection(cart: OptimizedBookingCartUi, selectedIds: string[]): string | undefined {
  if (!selectedIds.length) return '请至少选择一项预订';
  const seenSlots = new Set<string>();
  for (const id of selectedIds) {
    const item = itemById(cart, id);
    if (!item) return `未知条目：${id}`;
    const slot = slotKeyForItem(item);
    if (seenSlots.has(slot)) return `同一品类只能选一项：${item.label_zh}`;
    seenSlots.add(slot);
  }
  return undefined;
}

function recomputeFromSelection(
  cart: OptimizedBookingCartUi,
  selectedIds: string[],
  options?: { preserveCheckoutState?: BookingCartState },
): OptimizedBookingCartUi {
  const selectedItems = selectedIds
    .map((id) => itemById(cart, id))
    .filter((i): i is BookingCartItemUi => Boolean(i));

  const totalPrice = selectedItems.reduce(
    (sum, i) => sum + (parseBookingPriceLabel(i.price_label) ?? 0),
    0,
  );
  const budgetLimit = cart.budget?.limit;
  const withinBudget = budgetLimit != null ? totalPrice <= budgetLimit : undefined;

  let cart_state: BookingCartState = cart.cart_state;
  if (options?.preserveCheckoutState === 'ready_to_checkout') {
    cart_state = 'ready_to_checkout';
  } else if (options?.preserveCheckoutState === 'checkout_submitted') {
    cart_state = 'checkout_submitted';
  } else if (budgetLimit != null) {
    cart_state = withinBudget ? 'optimized' : 'over_budget';
  } else {
    cart_state = 'draft';
  }

  const groups = groupItemsBySlot(cart.items);
  const savings_opportunities =
    cart_state === 'over_budget'
      ? (() => {
          const swaps = buildSavingsOpportunities(groups, selectedItems);
          if (swaps.length) return swaps;
          if (budgetLimit != null && totalPrice > budgetLimit) {
            return [
              {
                category: '预算',
                suggestion_zh: `当前组合仍超出预算约 ¥${Math.round(totalPrice - budgetLimit)}，可提高总预算或减少预订品类`,
                potential_saving_numeric: totalPrice - budgetLimit,
              },
            ];
          }
          return undefined;
        })()
      : undefined;

  const currency =
    selectedItems.find((i) => i.currency?.trim())?.currency?.trim() ?? cart.selection?.currency;

  return {
    ...cart,
    cart_state,
    selection: {
      selected_item_ids: selectedIds,
      ...(totalPrice > 0 ? { total_price_numeric: totalPrice } : {}),
      ...(currency ? { currency } : {}),
      ...(withinBudget != null ? { within_budget: withinBudget } : {}),
      ...(budgetLimit != null ? { budget_limit: budgetLimit } : {}),
    },
    ...(savings_opportunities?.length ? { savings_opportunities } : {}),
    computed_at: new Date().toISOString(),
  };
}

function buildCheckoutLines(cart: OptimizedBookingCartUi): BookingCartCheckoutLineUi[] {
  const ids = cart.selection?.selected_item_ids ?? [];
  return ids
    .map((id) => itemById(cart, id))
    .filter((i): i is BookingCartItemUi => Boolean(i))
    .map((item) => ({
      item_id: item.item_id,
      kind: item.kind,
      label_zh: item.label_zh,
      ...(item.href ? { href: item.href } : {}),
      ...(item.api_action ? { api_action: item.api_action } : {}),
      ...(item.price_label ? { price_label: item.price_label } : {}),
    }));
}

export async function applyBookingCartAction(
  input: ApplyBookingCartActionInput,
): Promise<ApplyBookingCartActionResult> {
  const { cart, action, payload } = input;
  const selectedIds = [...(cart.selection?.selected_item_ids ?? [])];

  if (action === 'update_selection') {
    const nextIds = payload?.selected_item_ids;
    if (!Array.isArray(nextIds) || !nextIds.length) {
      return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: 'selected_item_ids 不能为空' };
    }
    const err = validateSelection(cart, nextIds);
    if (err) return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: err };
    return { status: 'OK', booking_cart: recomputeFromSelection(cart, nextIds) };
  }

  if (action === 'apply_saving') {
    const idx = payload?.saving_index;
    if (typeof idx !== 'number' || idx < 0) {
      return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: 'saving_index 无效' };
    }
    const saving = cart.savings_opportunities?.[idx];
    if (!saving?.from_item_id || !saving.to_item_id) {
      return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: '该换选建议不可自动应用' };
    }
    const nextIds = selectedIds.map((id) => (id === saving.from_item_id ? saving.to_item_id! : id));
    const err = validateSelection(cart, nextIds);
    if (err) return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: err };
    return { status: 'OK', booking_cart: recomputeFromSelection(cart, nextIds) };
  }

  if (action === 'confirm_ready') {
    const err = validateSelection(cart, selectedIds);
    if (err) return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: err };
    const withinBudget = cart.selection?.within_budget;
    if (withinBudget === false && !payload?.acknowledge_over_budget) {
      return {
        status: 'REJECTED',
        booking_cart: cart,
        rejection_reason_zh: '当前组合超出预算，请换选或勾选 acknowledge_over_budget',
      };
    }
    const readyCart = recomputeFromSelection(cart, selectedIds, {
      preserveCheckoutState: 'ready_to_checkout',
    });
    return {
      status: 'OK',
      booking_cart: {
        ...readyCart,
        headline_zh: `已确认 ${selectedIds.length} 项预订组合，可提交 checkout（采样报价，下单前请再次确认）`,
      },
      checkout: {
        status: 'ready',
        deep_links: buildCheckoutLines(readyCart),
        disclaimer_zh: '报价来自采样库存，跳转外部站点前请核对价格与退改政策',
      },
    };
  }

  if (action === 'submit_checkout') {
    if (cart.cart_state !== 'ready_to_checkout') {
      return {
        status: 'REJECTED',
        booking_cart: cart,
        rejection_reason_zh: '请先 confirm_ready 再提交 checkout',
      };
    }
    const bundle = await lockBookingCheckoutBundle({
      cart,
      tripId: input.tripId ?? cart.trip_id,
      refreshCarRentalById: input.refreshCarRentalById,
    });
    const lines = buildCheckoutLines(cart).map((line) => {
      const locked = bundle.lines.find((l) => l.item_id === line.item_id);
      if (!locked) return line;
      return {
        ...line,
        price_label:
          locked.locked_price_numeric > 0
            ? `¥${Math.round(locked.locked_price_numeric)}`
            : line.price_label,
        ...(locked.href ? { href: locked.href } : {}),
        ...(locked.api_action ? { api_action: locked.api_action } : {}),
      };
    });
    const submittedCart: OptimizedBookingCartUi = {
      ...cart,
      cart_state: 'checkout_submitted',
      quote_only: bundle.quote_only,
      headline_zh: bundle.quote_only
        ? `已提交 ${lines.length} 项预订 Bundle（部分仍为采样报价，请核对后支付）`
        : `已锁定 ${lines.length} 项 Bundle 结算单，总价约 ¥${Math.round(bundle.total_locked_price_numeric)}`,
      computed_at: new Date().toISOString(),
      selection: {
        ...cart.selection,
        selected_item_ids: cart.selection?.selected_item_ids ?? [],
        total_price_numeric: bundle.total_locked_price_numeric,
        ...(bundle.currency ? { currency: bundle.currency } : {}),
      },
    };
    return {
      status: 'OK',
      booking_cart: submittedCart,
      checkout: {
        status: 'submitted',
        deep_links: lines,
        disclaimer_zh: bundle.disclaimer_zh,
        bundle,
      },
    };
  }

  return { status: 'REJECTED', booking_cart: cart, rejection_reason_zh: `未知 action: ${action}` };
}
