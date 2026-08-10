/**
 * Lodging MDS Projector — Trip lodging coverage slice → 只读投影。
 */

import type { TripLodgingCoverageFactSlice } from '../harness/trip-lodging-coverage-fact.util';
import type {
  DecisionStateContract,
  DecisionStateProjection,
  ProjectedKeyState,
  StateKey,
} from './decision-state.types';

export type LodgingDecisionProjectionHints = {
  message?: string | null;
  tripId?: string | null;
  focusDayIndex?: number | null;
  lodgingCoverage?: TripLodgingCoverageFactSlice | null;
  hotelSearchMeta?: {
    mode?: string | null;
    ok?: boolean | null;
  } | null;
  partySize?: number | null;
};

function parseDay(message: string, focusDay?: number | null): number | null {
  const m = String(message ?? '').match(/(?:第\s*(\d+)\s*天|Day\s*[-_]?\s*(\d+))/i);
  const n = m
    ? Number(m[1] || m[2])
    : focusDay != null && Number(focusDay) > 0
      ? Number(focusDay)
      : NaN;
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function projectLodgingDecisionState(
  contract: DecisionStateContract,
  hints: LodgingDecisionProjectionHints,
): DecisionStateProjection {
  const tripId = String(hints.tripId ?? '').trim();
  const coverage = hints.lodgingCoverage ?? null;
  const day = parseDay(String(hints.message ?? ''), hints.focusDayIndex);

  const resolveKey = (key: StateKey): ProjectedKeyState => {
    switch (key) {
      case 'trip_binding':
        return tripId
          ? { key, presence: 'PRESENT', value: { tripId } }
          : { key, presence: 'MISSING' };
      case 'trip_day_span':
        if (coverage && coverage.dayCount > 0) {
          return {
            key,
            presence: 'PRESENT',
            value: {
              dayCount: coverage.dayCount,
              nightsExpected: coverage.nightsExpected,
            },
          };
        }
        return tripId
          ? { key, presence: 'UNKNOWN', noteZh: '行程已绑定，待加载日列表' }
          : { key, presence: 'MISSING' };
      case 'lodging_coverage':
        if (!coverage) {
          return {
            key,
            presence: tripId ? 'UNKNOWN' : 'MISSING',
            noteZh: tripId ? '待 LOAD_TRIP_LODGING_SLICE' : '无行程',
          };
        }
        return {
          key,
          presence: 'PRESENT',
          value: {
            missingDayNumbers: coverage.missingDayNumbers,
            nightsCovered: coverage.nightsCovered,
            nightsExpected: coverage.nightsExpected,
          },
        };
      case 'day_anchor':
        return day != null
          ? { key, presence: 'PRESENT', value: { dayIndex: day } }
          : { key, presence: 'MISSING' };
      case 'lodging_assignment': {
        if (!coverage || day == null) {
          return {
            key,
            presence: coverage ? 'UNKNOWN' : 'MISSING',
          };
        }
        const night = coverage.nights.find((n) => n.dayNumber === day);
        if (!night) return { key, presence: 'UNKNOWN' };
        return {
          key,
          presence: 'PRESENT',
          value: {
            hasLodging: night.hasLodging,
            lodgingNameZh: night.lodgingNameZh ?? null,
            overnightExpected: night.overnightExpected,
          },
        };
      }
      case 'party_size':
        return hints.partySize != null && hints.partySize > 0
          ? { key, presence: 'PRESENT', value: { size: hints.partySize } }
          : { key, presence: 'MISSING' };
      case 'booking_channel': {
        const meta = hints.hotelSearchMeta;
        if (!meta) return { key, presence: 'UNKNOWN', value: { mode: 'UNKNOWN' } };
        if (meta.ok) return { key, presence: 'PRESENT', value: { mode: 'LIVE' } };
        return {
          key,
          presence: 'PRESENT',
          value: { mode: 'CATALOG' },
          noteZh: 'hotel_search_degraded',
        };
      }
      default:
        return { key, presence: 'UNKNOWN' };
    }
  };

  return {
    decisionClass: contract.decisionClass,
    contractVersion: contract.version,
    keys: contract.keys.map((k) => resolveKey(k.key)),
    ignored: contract.ignoredWorldKeys.map((key) => ({
      key,
      presence: 'IGNORED' as const,
      noteZh: 'undeclared_by_contract',
    })),
  };
}
