import { TravelMode } from '../dto/trip-intent.dto';
import { resolveEffectiveTravelMode } from '../trip-constraint-solver/utils/constraints-summary.util';

/** assess / metrics 与 constraints-summary 一致的出行方式解析 */
export function resolveTripAssessmentTravelMode(
  pacingConfig: unknown,
  requestTravelMode?: TravelMode,
  userPreferenceTravelMode?: TravelMode,
): TravelMode {
  if (requestTravelMode) return requestTravelMode;

  const fromPacing = (pacingConfig as { travelMode?: TravelMode } | null)?.travelMode;
  if (fromPacing) return fromPacing;

  const effective = resolveEffectiveTravelMode(pacingConfig);
  if (effective === 'DRIVING') return TravelMode.DRIVING;
  if (effective === 'PUBLIC_TRANSIT') return TravelMode.PUBLIC_TRANSIT;
  if (effective === 'MIXED') return TravelMode.MIXED;

  if (userPreferenceTravelMode) return userPreferenceTravelMode;

  return TravelMode.DRIVING;
}

export type ItemTravelSegment = {
  duration: number;
  distance: number;
  travelMode: string | null;
};

export function buildTravelSegmentMap(
  segments: Array<{
    toItemId?: string;
    duration?: number | null;
    distance?: number | null;
    travelMode?: string | null;
  }>,
): Map<string, ItemTravelSegment> {
  const map = new Map<string, ItemTravelSegment>();
  for (const seg of segments) {
    if (!seg.toItemId || seg.duration == null || seg.duration <= 0) continue;
    map.set(seg.toItemId, {
      duration: seg.duration,
      distance: seg.distance ?? 0,
      travelMode: seg.travelMode ?? null,
    });
  }
  return map;
}

export function resolveItemTravelMinutes(
  item: { id?: string; travelFromPreviousDuration?: number | null },
  travelByToItem: Map<string, ItemTravelSegment>,
): number {
  if (item.id) {
    const seg = travelByToItem.get(item.id);
    if (seg && seg.duration > 0) return seg.duration;
  }
  return item.travelFromPreviousDuration ?? 0;
}
