// src/trips/iceland/market-preference/resolve-market-canonical-route.util.ts

import { loadIcelandMarketPreferenceMatrix } from './load-iceland-market-preference-matrix';
import type { IcelandMarketSegmentId } from './iceland-market-preference.types';

/** 市场产品壳 ID → RouteDirection.fixture `name`（DB 唯一键） */
export const ICELAND_MARKET_CANONICAL_TO_ROUTE_DIRECTION_NAME: Record<string, string> = {
  'IS-SOUTH-GOLDEN-5-7-LUX': 'IS_MARKET_US_SOUTH_GOLDEN_5_7_LUX',
  'IS-WINTER-REYK-AURORA-4-5': 'IS_MARKET_UK_WINTER_REYK_AURORA_4_5',
  'IS-HIGHLANDS-WESTFJORDS-10-14': 'IS_MARKET_DACH_HIGHLANDS_WESTFJORDS_10_14',
  'IS-CINEMATIC-RING-9': 'IS_MARKET_EAST_ASIA_CINEMATIC_RING_9',
};

export function resolveRouteDirectionNameFromMarketCanonical(
  canonicalRouteId: string | undefined,
): string | undefined {
  if (!canonicalRouteId?.trim()) return undefined;
  return ICELAND_MARKET_CANONICAL_TO_ROUTE_DIRECTION_NAME[canonicalRouteId.trim()];
}

export function resolveRouteDirectionNameForSegment(
  segmentId: IcelandMarketSegmentId,
): string | undefined {
  const matrix = loadIcelandMarketPreferenceMatrix();
  const canonical = matrix.segments[segmentId]?.canonical_route_id;
  return resolveRouteDirectionNameFromMarketCanonical(canonical);
}
