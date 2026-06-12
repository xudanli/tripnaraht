/**
 * 预订购物车联合优化（预算约束 + 状态机，schema 扩展 tripnara.booking_cart@v1）
 *
 * Phase-4c：在分槽贪心基线之上，支持高光锚点锁定 + 受限多维背包（每槽选一、最大化体验分）。
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
  /** 全局 tradeoff 叙事（如「平替前两晚换第 N 天温泉」） */
  trade_off_narrative?: string;
}

/** 背包寻优内部条目（由 BookingCartItemUi 投影） */
export interface CartItem {
  id: string;
  slotId: string;
  type: 'FLIGHT' | 'HOTEL' | 'CAR';
  price: number;
  experienceScore: number;
  isLuxuryAnchor: boolean;
  associatedDayNumber?: number;
  sourceItemId: string;
}

/** @alias CartItem */
export type CartOptimizationItem = CartItem;

export interface BookingCartGlobalPreferences {
  preferHighlightAnchor?: boolean;
  /** 显式高光住宿 night_index（1-based） */
  luxuryAnchorNightIndices?: number[];
}

export interface OptimizeBookingCartUiOptions {
  budget?: { total?: number | null; currency?: string | null } | null;
  globalPreferences?: BookingCartGlobalPreferences;
  /** 默认 true：有预算且多槽时启用全局背包 */
  useGlobalOptimization?: boolean;
}

export interface BookingCartGlobalResult {
  selectedItemIds: string[];
  cartState: BookingCartState;
  totalPrice: number;
  tradeOffNarrative?: string;
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

export function slotIdForCartItem(item: BookingCartItemUi): string {
  if (item.kind === 'flight') {
    const leg = flightLegIndex(item);
    return leg != null ? `flight_leg_${leg}` : `flight_${item.item_id}`;
  }
  if (item.kind === 'hotel') {
    const night = hotelNightIndex(item);
    return night != null ? `hotel_night_${night}` : `hotel_${item.item_id}`;
  }
  if (item.kind === 'car_rental') return 'car_rental';
  return `other_${item.item_id}`;
}

export function groupItemsBySlot(items: BookingCartItemUi[]): Map<string, BookingCartItemUi[]> {
  const groups = new Map<string, BookingCartItemUi[]>();
  for (const item of items) {
    const key = slotIdForCartItem(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

function cartItemKindToType(kind: BookingCartItemUi['kind']): CartOptimizationItem['type'] {
  if (kind === 'flight') return 'FLIGHT';
  if (kind === 'hotel') return 'HOTEL';
  if (kind === 'car_rental') return 'CAR';
  return 'HOTEL';
}

function inferExperienceScore(item: BookingCartItemUi): number {
  const meta = item.metadata ?? {};
  const rating =
    typeof meta.rating === 'number'
      ? meta.rating
      : typeof meta.review_score === 'number'
        ? meta.review_score
        : typeof meta.stars === 'number'
          ? meta.stars / 5
          : undefined;
  if (rating != null && Number.isFinite(rating)) {
    return Math.max(0, Math.min(1, rating > 1 ? rating / 5 : rating));
  }
  if (meta.is_luxury_anchor === true || meta.is_highlight === true) return 0.85;
  const price = parseBookingPriceLabel(item.price_label);
  if (price != null && price > 800) return 0.65;
  return 0.5;
}

function isLuxuryAnchorItem(item: BookingCartItemUi): boolean {
  const meta = item.metadata ?? {};
  return meta.is_luxury_anchor === true || meta.is_highlight === true;
}

/** 将 UI 购物车条目投影为背包寻优条目 */
export function cartOptimizationItemsFromUi(
  items: BookingCartItemUi[],
  prefs?: BookingCartGlobalPreferences,
): CartOptimizationItem[] {
  return items
    .map((item) => {
      const price = parseBookingPriceLabel(item.price_label);
      if (price == null) return null;
      const slotId = slotIdForCartItem(item);
      const night = hotelNightIndex(item);
      return {
        id: item.item_id,
        slotId,
        type: cartItemKindToType(item.kind),
        price,
        experienceScore: inferExperienceScore(item),
        isLuxuryAnchor: isLuxuryAnchorItem(item),
        ...(night != null ? { associatedDayNumber: night } : {}),
        sourceItemId: item.item_id,
      } satisfies CartOptimizationItem;
    })
    .filter((x): x is CartOptimizationItem => x != null);
}

/**
 * 受限多维背包：每 slot 至多选一项，锁定 luxury anchor，最大化体验分。
 * 槽位数 ≤ 24、每槽候选 ≤ 8 时用 DP；否则回退效益比贪心。
 */
function resolveLockedAnchorsBySlot(
  cartItems: CartOptimizationItem[],
  prefs?: BookingCartGlobalPreferences,
): Map<string, CartOptimizationItem> {
  const locked = new Map<string, CartOptimizationItem>();

  for (const item of cartItems) {
    if (!item.isLuxuryAnchor) continue;
    const prev = locked.get(item.slotId);
    if (!prev || item.experienceScore > prev.experienceScore || item.price > prev.price) {
      locked.set(item.slotId, item);
    }
  }

  for (const night of prefs?.luxuryAnchorNightIndices ?? []) {
    const slotId = `hotel_night_${night}`;
    const candidates = cartItems.filter((i) => i.slotId === slotId);
    if (!candidates.length) continue;
    const best = [...candidates].sort(
      (a, b) => b.experienceScore - a.experienceScore || b.price - a.price,
    )[0];
    locked.set(slotId, best);
  }

  return locked;
}

export function optimizeBookingCartGlobal(
  cartItems: CartOptimizationItem[],
  totalBudget: number,
  userPreferences: BookingCartGlobalPreferences = {},
): BookingCartGlobalResult {
  const lockedBySlot = resolveLockedAnchorsBySlot(cartItems, userPreferences);
  const luxuryAnchors = [...lockedBySlot.values()];
  const anchorCost = luxuryAnchors.reduce((sum, item) => sum + item.price, 0);

  const slotCandidates = new Map<string, CartOptimizationItem[]>();
  for (const item of cartItems) {
    if (lockedBySlot.has(item.slotId) && lockedBySlot.get(item.slotId)!.id !== item.id) continue;
    const list = slotCandidates.get(item.slotId) ?? [];
    list.push(item);
    slotCandidates.set(item.slotId, list);
  }

  const slots = [...slotCandidates.keys()];
  const remainingBudget = Math.max(0, totalBudget - anchorCost);

  const pickByDp = (): CartOptimizationItem[] => {
    const budgetCap = Math.min(Math.ceil(remainingBudget), 500_000);
    if (budgetCap <= 0 || !slots.length) return [...lockedBySlot.values()];

    type DpCell = { score: number; picks: CartOptimizationItem[] };
    let dp: DpCell[] = Array.from({ length: budgetCap + 1 }, (_, i) =>
      i === 0 ? { score: 0, picks: [] } : { score: -Infinity, picks: [] },
    );

    for (const slot of slots) {
      const locked = lockedBySlot.get(slot);
      const choices = locked ? [locked] : (slotCandidates.get(slot) ?? []);
      const next: DpCell[] = Array.from({ length: budgetCap + 1 }, () => ({
        score: -Infinity,
        picks: [],
      }));

      for (let b = 0; b <= budgetCap; b++) {
        const base = dp[b];
        if (!base || base.score === -Infinity) continue;
        for (const choice of choices) {
          const cost = locked ? 0 : choice.price;
          const nb = b + cost;
          if (nb > budgetCap) continue;
          const expBoost =
            userPreferences.preferHighlightAnchor && choice.isLuxuryAnchor ? 0.05 : 0;
          const newScore = base.score + choice.experienceScore + expBoost;
          if (newScore > next[nb].score) {
            next[nb].picks = [...base.picks, choice];
            next[nb].score = newScore;
          }
        }
      }
      dp = next;
    }

    let best: DpCell = { score: -Infinity, picks: [] };
    for (let b = 0; b <= budgetCap; b++) {
      if (dp[b].score > best.score) best = dp[b];
    }
    return best.picks.length ? best.picks : [...lockedBySlot.values()];
  };

  const pickByGreedy = (): CartOptimizationItem[] => {
    const selected = [...lockedBySlot.values()];
    let spent = anchorCost;
    const filled = new Set(selected.map((s) => s.slotId));

    const remaining = cartItems.filter((item) => !filled.has(item.slotId));
    const bySlot = new Map<string, CartOptimizationItem[]>();
    for (const item of remaining) {
      const list = bySlot.get(item.slotId) ?? [];
      list.push(item);
      bySlot.set(item.slotId, list);
    }

    const slotOrder = [...bySlot.entries()].sort(([, a], [, b]) => {
      const maxA = Math.max(...a.map((x) => x.experienceScore / Math.max(1, x.price)));
      const maxB = Math.max(...b.map((x) => x.experienceScore / Math.max(1, x.price)));
      return maxB - maxA;
    });

    for (const [slot, candidates] of slotOrder) {
      if (filled.has(slot)) continue;
      const sorted = [...candidates].sort((a, b) => {
        const effA = a.experienceScore / Math.max(1, a.price);
        const effB = b.experienceScore / Math.max(1, b.price);
        return effB - effA;
      });
      const pick =
        sorted.find((c) => spent + c.price <= totalBudget) ??
        sorted[sorted.length - 1];
      selected.push(pick);
      spent += pick.price;
      filled.add(slot);
    }
    return selected;
  };

  const totalCandidates = cartItems.length;
  const useDp = slots.length <= 24 && totalCandidates <= 64;
  const selected = useDp ? pickByDp() : pickByGreedy();

  const selectedIds = selected.map((i) => i.sourceItemId);
  const totalPrice = selected.reduce((s, i) => s + i.price, 0);
  const cartState: BookingCartState = totalPrice <= totalBudget ? 'optimized' : 'over_budget';

  const anchorForNarrative = luxuryAnchors[0];
  const tradeOffNarrative =
    luxuryAnchors.length > 0 && userPreferences.preferHighlightAnchor !== false
      ? `💡 预算对账：为确保第 ${anchorForNarrative.associatedDayNumber ?? '?'} 天的高光体验（${anchorForNarrative.type === 'HOTEL' ? '顶级住宿' : '核心预订'}），系统已在其余槽位优先选择高性价比选项，整体预算仍控制在预期内。`
      : undefined;

  return {
    selectedItemIds: selectedIds,
    cartState,
    totalPrice,
    tradeOffNarrative,
  };
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

function uiItemsFromIds(cart: BookingCartUi, ids: string[]): BookingCartItemUi[] {
  const idSet = new Set(ids);
  return cart.items.filter((i) => idSet.has(i.item_id));
}

function normalizeOptimizeOptions(
  budgetOrOptions?: OptimizeBookingCartUiOptions | { total?: number | null; currency?: string | null } | null,
): OptimizeBookingCartUiOptions {
  if (!budgetOrOptions) return {};
  const asRecord = budgetOrOptions as Record<string, unknown>;
  if (
    'budget' in asRecord ||
    'globalPreferences' in asRecord ||
    'useGlobalOptimization' in asRecord
  ) {
    return budgetOrOptions as OptimizeBookingCartUiOptions;
  }
  return { budget: budgetOrOptions as OptimizeBookingCartUiOptions['budget'] };
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
 * 有预算且启用 global 时走多维背包；否则回退分槽贪心。
 */
export function optimizeBookingCartUi(
  cart: BookingCartUi,
  budgetOrOptions?: OptimizeBookingCartUiOptions | { total?: number | null; currency?: string | null } | null,
): OptimizedBookingCartUi {
  const options = normalizeOptimizeOptions(budgetOrOptions);

  const budget = options.budget;
  const groups = groupItemsBySlot(cart.items);
  const budgetLimit =
    typeof budget?.total === 'number' && budget.total > 0 ? budget.total : undefined;

  const useGlobal =
    options.useGlobalOptimization !== false &&
    budgetLimit != null &&
    groups.size >= 2;

  let selectedItems: BookingCartItemUi[];
  let trade_off_narrative: string | undefined;

  if (useGlobal) {
    const optItems = cartOptimizationItemsFromUi(cart.items, options.globalPreferences);
    const global = optimizeBookingCartGlobal(optItems, budgetLimit!, options.globalPreferences ?? {});
    selectedItems = uiItemsFromIds(cart, global.selectedItemIds);
    trade_off_narrative = global.tradeOffNarrative;
    if (!selectedItems.length) {
      selectedItems = pickCheapestPerGroup(groups);
    }
  } else {
    selectedItems = pickCheapestPerGroup(groups);
  }

  const selectedIds = selectedItems.map((i) => i.item_id);
  const totalPrice = sumSelectedPrices(selectedItems);
  const currency = resolveCurrency(selectedItems, budget?.currency ?? undefined);

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
                suggestion_zh: `当前组合仍超出预算约 ¥${Math.round(totalPrice - budgetLimit)}，可提高总预算或应用换选建议`,
                potential_saving_numeric: totalPrice - budgetLimit,
              },
            ];
          }
          return undefined;
        })()
      : undefined;

  let headline_zh = cart.headline_zh;
  if (budgetLimit != null && withinBudget === true) {
    headline_zh = useGlobal
      ? `已在 ¥${Math.round(budgetLimit)} 预算内完成全局优选（${selectedIds.length} 项，最大化体验分）`
      : `已在 ¥${Math.round(budgetLimit)} 预算内为您优选 ${selectedIds.length} 项预订组合（采样报价）`;
  } else if (cart_state === 'over_budget') {
    headline_zh = `当前组合约 ¥${Math.round(totalPrice)}，超出预算 ¥${Math.round(budgetLimit!)}，请查看换选建议`;
  }

  return {
    ...cart,
    cart_state,
    headline_zh,
    ...(trade_off_narrative ? { trade_off_narrative } : {}),
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
