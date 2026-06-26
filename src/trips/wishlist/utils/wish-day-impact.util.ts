import type { TripWishItemRecord, WishCategory } from '../types/trip-wish.types';
import { getIcelandInspirationAsset } from '../data/iceland-inspiration.assets';

/** Categories that apply to every day on the timeline. */
export const GLOBAL_WISH_CATEGORIES = new Set<WishCategory>([
  'destination_route',
  'insurance_visa',
  'main_transport',
]);

export interface TripDayContext {
  dayIndex: number;
  date: string;
  /** Lowercased searchable text: place names, notes, regions. */
  textBlob: string;
  poiIds: string[];
}

export interface DayWishImpact {
  dayIndex: number;
  impactCount: number;
  wishIds: string[];
}

function collectWishNeedles(wish: TripWishItemRecord): string[] {
  const needles = new Set<string>();
  wish.structuredHints?.must_do?.forEach((x) => needles.add(x.toLowerCase()));
  wish.structuredHints?.tags?.forEach((x) => needles.add(x.toLowerCase()));
  wish.text.toLowerCase().split(/\s+/).filter((w) => w.length >= 2).forEach((w) => needles.add(w));

  const inspirationId = wish.sourceRef?.inspirationAssetId;
  if (inspirationId) {
    const asset = getIcelandInspirationAsset(inspirationId);
    asset?.relatedPoiIds?.forEach((id) => needles.add(id.toLowerCase()));
    asset?.tags.forEach((t) => needles.add(t.toLowerCase()));
    if (asset?.region) needles.add(asset.region.toLowerCase());
  }

  return [...needles];
}

function wishMatchesDay(wish: TripWishItemRecord, day: TripDayContext): boolean {
  if (GLOBAL_WISH_CATEGORIES.has(wish.category)) {
    return true;
  }

  const needles = collectWishNeedles(wish);
  if (needles.length === 0) {
    return false;
  }

  const haystack = day.textBlob;
  if (needles.some((n) => haystack.includes(n))) {
    return true;
  }

  return day.poiIds.some((poiId) => needles.some((n) => poiId.includes(n) || n.includes(poiId)));
}

/**
 * Compute per-day private wish impact counts for timeline badges.
 */
export function computeDayWishImpact(
  wishes: TripWishItemRecord[],
  days: TripDayContext[],
): DayWishImpact[] {
  const activePrivate = wishes.filter(
    (w) => w.status === 'active' && w.agentEligible && w.visibility === 'private',
  );

  if (days.length === 0) {
    return [];
  }

  return days.map((day) => {
    const matched = activePrivate.filter((w) => wishMatchesDay(w, day));
    return {
      dayIndex: day.dayIndex,
      impactCount: matched.length,
      wishIds: matched.map((w) => w.id),
    };
  });
}
