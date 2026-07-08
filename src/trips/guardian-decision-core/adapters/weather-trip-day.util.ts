/**
 * Slice 2 — resolve trip-day coordinates for live weather reads.
 */

import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import { indexSegmentsByDay } from '../detection/segment-plan-item.util';

export interface TripDayLocation {
  dayIndex: number;
  lat: number;
  lng: number;
  regionId: string;
}

export function resolveTripDayLocation(
  plan: RoutePlanDraft,
  dayIndex: number,
): TripDayLocation | undefined {
  const byDay = indexSegmentsByDay(plan);
  const segments = byDay.get(dayIndex) ?? [];
  for (const segment of segments) {
    const meta = segment.metadata as Record<string, unknown> | undefined;
    const lat = meta?.lat ?? meta?.latitude;
    const lng = meta?.lng ?? meta?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const regionId =
        typeof meta?.regionId === 'string'
          ? meta.regionId
          : `day_${dayIndex}`;
      return { dayIndex, lat, lng, regionId };
    }
  }
  return undefined;
}

export function windMsToKmh(ms: number): number {
  return Math.round(ms * 3.6 * 10) / 10;
}
