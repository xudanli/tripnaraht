import { EXPOSED_TRAVEL_MODE_OPTIONS } from '../../common/constants/travel-mode-scope.constants';
import type { TripMoodTag } from '../types/match-square.types';

export const TRIP_MOOD_TAG_OPTIONS: Array<{ id: TripMoodTag; label: string }> = [
  { id: 'relax', label: '放松' },
  { id: 'adventure', label: '冒险' },
  { id: 'healing', label: '疗愈' },
  { id: 'social', label: '社交' },
];

export const TRAVEL_MODE_OPTIONS = [...EXPOSED_TRAVEL_MODE_OPTIONS];

const VALID_MOOD_IDS = new Set(TRIP_MOOD_TAG_OPTIONS.map((t) => t.id));

export function isValidTripMoodTag(value: string): value is TripMoodTag {
  return VALID_MOOD_IDS.has(value as TripMoodTag);
}
