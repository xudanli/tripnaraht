/**
 * TripDayWorldState.conflict → MDS day_conflict（只读映射，非第二事实库）。
 */

import type { TripDayWorldStateResolution } from '../../trips/utils/resolve-trip-day-world-state.util';
import type { DayConflictStatus } from './decision-state.types';

export type MdsDayConflict = {
  status: DayConflictStatus;
  reasons: string[];
};

export function mapTripDayWorldConflictToMds(
  conflict: TripDayWorldStateResolution['conflict'] | null | undefined,
  extras?: { matchedOtherDays?: number[] },
): MdsDayConflict {
  switch (conflict) {
    case 'none':
      return { status: 'NONE', reasons: [] };
    case 'empty_day':
      return { status: 'SOFT', reasons: ['empty_day'] };
    case 'theme_without_items':
      return { status: 'SOFT', reasons: ['theme_without_items'] };
    case 'activity_on_other_day':
      return {
        status: 'HARD',
        reasons: [
          'activity_on_other_day',
          ...(extras?.matchedOtherDays?.length
            ? [`matched_days=${extras.matchedOtherDays.join(',')}`]
            : []),
        ],
      };
    case 'day_out_of_range':
      return { status: 'HARD', reasons: ['day_out_of_range'] };
    default:
      return { status: 'UNKNOWN', reasons: ['unresolved'] };
  }
}
