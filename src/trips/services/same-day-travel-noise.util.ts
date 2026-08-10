/**
 * Same-day / soft travel-buffer noise control.
 * Hard conflicts (start too early) always report; soft "缓冲偏紧" skips short hops.
 */

export const DEFAULT_TIGHT_TRAVEL_GAP_MINUTES = 30;
export const DEFAULT_SHORT_HOP_MAX_KM = 40;
export const DEFAULT_SHORT_HOP_MAX_TRAVEL_MINUTES = 40;

export function shouldReportSoftTightTravel(input: {
  isStartTooEarly: boolean;
  gapMinutes: number;
  tightGapMinutes?: number;
  distanceKm: number;
  travelMinutes: number;
  shortHopMaxKm?: number;
  shortHopMaxTravelMinutes?: number;
}): boolean {
  if (input.isStartTooEarly) return true;

  const tightGap = input.tightGapMinutes ?? DEFAULT_TIGHT_TRAVEL_GAP_MINUTES;
  if (input.gapMinutes > tightGap) return false;

  const maxKm = input.shortHopMaxKm ?? DEFAULT_SHORT_HOP_MAX_KM;
  const maxTravel =
    input.shortHopMaxTravelMinutes ?? DEFAULT_SHORT_HOP_MAX_TRAVEL_MINUTES;

  // Nearby POI hops (瀑布串、冰河湖↔钻石沙滩) are packing noise, not transport risk.
  if (
    (Number.isFinite(input.distanceKm) && input.distanceKm <= maxKm) ||
    (Number.isFinite(input.travelMinutes) && input.travelMinutes <= maxTravel)
  ) {
    return false;
  }

  return true;
}
