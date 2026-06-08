import type { TripMoodTag } from '../types/match-square.types';

export const TRIP_MOOD_TAG_OPTIONS: Array<{ id: TripMoodTag; label: string }> = [
  { id: 'relax', label: '放松' },
  { id: 'adventure', label: '冒险' },
  { id: 'healing', label: '疗愈' },
  { id: 'social', label: '社交' },
];

export const TRAVEL_MODE_OPTIONS = [
  { id: 'self_drive' as const, label: '自驾' },
  { id: 'public_transit' as const, label: '公共交通' },
  { id: 'mixed' as const, label: '混合出行' },
  { id: 'other' as const, label: '其他' },
];

const VALID_MOOD_IDS = new Set(TRIP_MOOD_TAG_OPTIONS.map((t) => t.id));

export function isValidTripMoodTag(value: string): value is TripMoodTag {
  return VALID_MOOD_IDS.has(value as TripMoodTag);
}
