import type { ResearchFinancials } from './research-team-bus.types';

function coercePositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = Number(String(v).replace(/,/g, '').replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function hotelRowsFromSkillResult(result: unknown): unknown[] {
  if (result === null || result === undefined) return [];
  if (Array.isArray(result)) return result;
  if (typeof result !== 'object') return [];
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.hotels)) return r.hotels;
  if (Array.isArray(r.results)) return r.results;
  if (Array.isArray(r.items)) return r.items;
  return [];
}

function priceFromHotelRow(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  for (const key of ['price', 'total_price', 'nightly_rate', 'lowest_price', 'amount', 'cost']) {
    const n = coercePositiveNumber(o[key]);
    if (n !== null) return n;
  }
  return null;
}

function medianSorted(sorted: number[]): number | null {
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * 用列表价差相对中位作为「边际效用」代理：分化越大，多花钱换更好档位的潜在收益越高（无保证价时返回 0）。
 */
export function marginalUtilityProxyFromPrices(prices: number[]): number {
  if (prices.length < 2) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const med = medianSorted(sorted);
  if (med === null || med <= 0) return 0;
  const i25 = Math.max(0, Math.floor(0.25 * (sorted.length - 1)));
  const i75 = Math.min(sorted.length - 1, Math.ceil(0.75 * (sorted.length - 1)));
  const spread = (sorted[i75]! - sorted[i25]!) / med;
  return clamp01(spread);
}

/**
 * 从 `live_hotel_refresh.result` 抽取酒店行价格的中位数，作为 5.0 `ResearchFinancials.estimated_cost` 的第一版信号。
 */
export function buildResearchFinancialsFromHotelLiveRefresh(
  researchData: Record<string, unknown>,
): ResearchFinancials | undefined {
  const live = researchData.live_hotel_refresh;
  if (!live || typeof live !== 'object') return undefined;
  const result = (live as Record<string, unknown>).result;
  const prices = hotelRowsFromSkillResult(result)
    .map(priceFromHotelRow)
    .filter((n): n is number => n !== null);
  if (!prices.length) return undefined;
  const sorted = [...prices].sort((a, b) => a - b);
  const estimated = medianSorted(sorted);
  if (estimated === null) return undefined;
  return {
    scope: 'hotel',
    estimated_cost: estimated,
    marginal_utility: marginalUtilityProxyFromPrices(prices),
  };
}
