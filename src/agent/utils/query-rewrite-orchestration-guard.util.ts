/**
 * Query Rewriting 与 route_and_run 意图分层边界：
 * 行程改排/选日/整段重规划等 NL 不是 POI/酒店检索 query，禁止 prepend 目的地或合并历史改写。
 */

import { detectItinerarySlotPlacementIntent } from './route-and-run-intent-analyzer.util';
import {
  detectFullTripReplanIntent,
  detectItineraryAdjustIntent,
} from './itinerary-adjust-intent.util';

export function shouldPassthroughQueryRewriteForOrchestrationNl(
  query: string,
  dateRange?: { start_date?: string; end_date?: string },
): boolean {
  const q = String(query ?? '').trim();
  if (!q) return false;
  if (detectItinerarySlotPlacementIntent(q)) return true;
  if (detectFullTripReplanIntent(q, dateRange)) return true;
  if (detectItineraryAdjustIntent(q, dateRange)) return true;
  return false;
}
