/**
 * 预订购物车联合优化（预算约束 + 状态机，schema 扩展 tripnara.booking_cart@v1）
 *
 * 对每个品类（航班 leg / 住宿 night / 租车）选一组最低价组合，再与总预算对账。
 */

import type { BookingCartItemUi, BookingCartUi } from './booking-cart-ui.util';

export type BookingCartState =
  | 'draft'
  | 'optimized'
  | 'over_budget'
  | 'ready_to_checkout'
  | 'checkout_submitted';

export interface BookingCartSelectionUi {
  selected_item_ids: string[];
  total_price_numeric?: number;
  currency?: string;
  within_budget?: boolean;
  budget_limit?: number;
}

export interface BookingCartBudgetUi {
  limit?: number;
  currency?: string;
  /** 建议交通（航班+租车）占预算比例 */
  transport_share_hint?: number;
  /** 建议住宿占预算比例 */
  accommodation_share_hint?: number;
}

export interface BookingCartSavingsUi {
  category: string;
  suggestion_zh: string;
  potential_saving_numeric?: number;
  from_item_id?: string;
  to_item_id?: string;
}

export interface OptimizedBookingCartUi extends BookingCartUi {
  cart_state: BookingCartState;
  selection?: BookingCartSelectionUi;
  budget?: BookingCartBudgetUi;
  savings_opportunities?: BookingCartSavingsUi[];
}

/** 从 price_label 抽取数值（支持 ¥12,800 / 12800 JPY 等） */
export function parseBookingPriceLabel(label?: string | null): number | undefined {
  if (!label?.trim()) return undefined;
  const normalized = label.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!normalized) return undefined;
  const n = parseFloat(normalized[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function flightLegIndex(item: BookingCartItemUi): number | undefined {
  const m = item.item_id.match(/flight_leg(\d+)_/);
  if (!m) return undefined;
  const idx = parseInt(m[1], 10);
  return Number.isFinite(idx) ? idx : undefined;
}

function hotelNightIndex(item: BookingCartItemUi): number | undefined {
  const raw = item.metadata?.night_index;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function groupItemsBySlot(items: BookingCartItemUi[]): Map<string, BookingCartItemUi[]> {
  const groups = new Map<string, BookingCartItemUi[]>();

  for (const item of items) {
    let key: string;
    if (item.kind === 'flight') {
      const leg = flightLegIndex(item);
      key = leg != null ? `flight_leg_${leg}` : `flight_${item.item_id}`;
    } else if (item.kind === 'hotel') {
      const night = hotelNightIndex(item);
      key = night != null ? `hotel_night_${night}` : `hotel_${item.item_id}`;
    } else if (item.kind === 'car_rental') {
      key = 'car_rental';
    } else {
      key = `other_${item.item_id}`;
    }
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return groups;
}

function pickCheapestPerGroup(groups: Map<string, BookingCartItemUi[]>): BookingCartItemUi[] {
  const picked: BookingCartItemUi[] = [];
  for (const [, list] of groups) {
    const sorted = [...list].sort((a, b) => {
      const pa = parseBookingPriceLabel(a.price_label) ?? Infinity;
      const pb = parseBookingPriceLabel(b.price_label) ?? Infinity;
      return pa - pb;
    });
    picked.push(sorted[0]);
  }
  return picked;
}

function sumSelectedPrices(items: BookingCartItemUi[]): number {
  return items.reduce((sum, i) => sum + (parseBookingPriceLabel(i.price_label) ?? 0), 0);
}

function resolveCurrency(items: BookingCartItemUi[], fallback?: string): string | undefined {
  for (const i of items) {
    if (i.currency?.trim()) return i.currency.trim();
  }
  return fallback?.trim() || undefined;
}

export function buildSavingsOpportunities(
  groups: Map<string, BookingCartItemUi[]>,
  selected: BookingCartItemUi[],
): BookingCartSavingsUi[] {
  const out: BookingCartSavingsUi[] = [];
  const selectedIds = new Set(selected.map((s) => s.item_id));

  for (const [slot, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const pa = parseBookingPriceLabel(a.price_label) ?? Infinity;
      const pb = parseBookingPriceLabel(b.price_label) ?? Infinity;
      return pa - pb;
    });
    const cheapest = sorted[0];
    const current = sorted.find((i) => selectedIds.has(i.item_id)) ?? cheapest;
    const cheapestPrice = parseBookingPriceLabel(cheapest.price_label);
    const currentPrice = parseBookingPriceLabel(current.price_label);
    if (
      cheapest.item_id !== current.item_id &&
      cheapestPrice != null &&
      currentPrice != null &&
      currentPrice > cheapestPrice
    ) {
      const category =
        slot.startsWith('flight') ? '航班' : slot.startsWith('hotel') ? '住宿' : slot === 'car_rental' ? '租车' : '预订';
      out.push({
        category,
        suggestion_zh: `可将「${current.label_zh}」换为「${cheapest.label_zh}」，约省 ¥${Math.round(currentPrice - cheapestPrice)}`,
        potential_saving_numeric: currentPrice - cheapestPrice,
        from_item_id: current.item_id,
        to_item_id: cheapest.item_id,
      });
    }
  }

  return out.slice(0, 4);
}

/**
 * 在已有购物车投影上施加预算约束选品与状态机。
 * 无预算时 cart_state=draft，仍返回默认最低价组合供前端预选。
 */
export function optimizeBookingCartUi(
  cart: BookingCartUi,
  budget?: { total?: number | null; currency?: string | null } | null,
): OptimizedBookingCartUi {
  const groups = groupItemsBySlot(cart.items);
  const selectedItems = pickCheapestPerGroup(groups);
  const selectedIds = selectedItems.map((i) => i.item_id);
  const totalPrice = sumSelectedPrices(selectedItems);
  const currency = resolveCurrency(selectedItems, budget?.currency ?? undefined);

  const budgetLimit =
    typeof budget?.total === 'number' && budget.total > 0 ? budget.total : undefined;

  const budgetUi: BookingCartBudgetUi | undefined = budgetLimit
    ? {
        limit: budgetLimit,
        ...(currency ? { currency } : {}),
        transport_share_hint: 0.35,
        accommodation_share_hint: 0.35,
      }
    : undefined;

  const withinBudget = budgetLimit != null ? totalPrice <= budgetLimit : undefined;
  let cart_state: BookingCartState = 'draft';
  if (budgetLimit != null) {
    cart_state = withinBudget ? 'optimized' : 'over_budget';
  }

  const savings_opportunities =
    cart_state === 'over_budget'
      ? (() => {
          const swaps = buildSavingsOpportunities(groups, selectedItems);
          if (swaps.length) return swaps;
          if (budgetLimit != null && totalPrice > budgetLimit) {
            return [
              {
                category: '预算',
                suggestion_zh: `当前最低价组合仍超出预算约 ¥${Math.round(totalPrice - budgetLimit)}，可提高总预算或减少可选预订品类`,
                potential_saving_numeric: totalPrice - budgetLimit,
              },
            ];
          }
          return undefined;
        })()
      : undefined;

  let headline_zh = cart.headline_zh;
  if (budgetLimit != null && withinBudget === true) {
    headline_zh = `已在 ¥${Math.round(budgetLimit)} 预算内为您优选 ${selectedIds.length} 项预订组合（采样报价）`;
  } else if (cart_state === 'over_budget') {
    headline_zh = `当前最低价组合约 ¥${Math.round(totalPrice)}，超出预算 ¥${Math.round(budgetLimit!)}，请查看换选建议`;
  }

  return {
    ...cart,
    cart_state,
    headline_zh,
    selection: {
      selected_item_ids: selectedIds,
      ...(totalPrice > 0 ? { total_price_numeric: totalPrice } : {}),
      ...(currency ? { currency } : {}),
      ...(withinBudget != null ? { within_budget: withinBudget } : {}),
      ...(budgetLimit != null ? { budget_limit: budgetLimit } : {}),
    },
    ...(budgetUi ? { budget: budgetUi } : {}),
    ...(savings_opportunities?.length ? { savings_opportunities } : {}),
  };
}
