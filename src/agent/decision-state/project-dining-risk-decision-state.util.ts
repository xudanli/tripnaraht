/**
 * Dining / Risk MDS Projector
 */

import { messageHasDiningLocationAnchor } from '../utils/trip-dining-consultation.util';
import type {
  DecisionStateContract,
  DecisionStateProjection,
  ProjectedKeyState,
  StateKey,
} from './decision-state.types';

export type DiningRiskProjectionHints = {
  message?: string | null;
  tripId?: string | null;
  focusDayIndex?: number | null;
  /** 当日已入库活动数 */
  dayActivityCount?: number | null;
  weatherSensorOk?: boolean | null;
  restaurantSensorOk?: boolean | null;
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

export function projectDiningRiskDecisionState(
  contract: DecisionStateContract,
  hints: DiningRiskProjectionHints,
): DecisionStateProjection {
  const message = String(hints.message ?? '');
  const tripId = String(hints.tripId ?? '').trim();
  const day = parseDay(message, hints.focusDayIndex);
  const hasDiningAnchor = messageHasDiningLocationAnchor(message) || day != null;

  const resolveKey = (key: StateKey): ProjectedKeyState => {
    switch (key) {
      case 'trip_binding':
        return tripId
          ? { key, presence: 'PRESENT', value: { tripId } }
          : { key, presence: 'MISSING' };
      case 'day_anchor':
        return day != null
          ? { key, presence: 'PRESENT', value: { dayIndex: day } }
          : { key, presence: 'MISSING' };
      case 'dining_anchor':
        return hasDiningAnchor
          ? {
              key,
              presence: 'PRESENT',
              value: { dayIndex: day, fromMessage: messageHasDiningLocationAnchor(message) },
            }
          : { key, presence: 'MISSING' };
      case 'restaurant_channel':
        if (hints.restaurantSensorOk === true) {
          return { key, presence: 'PRESENT', value: { mode: 'LIVE' } };
        }
        if (hints.restaurantSensorOk === false) {
          return {
            key,
            presence: 'PRESENT',
            value: { mode: 'CATALOG' },
            noteZh: 'restaurant_sensor_degraded',
          };
        }
        return { key, presence: 'UNKNOWN', value: { mode: 'UNKNOWN' } };
      case 'weather_evidence':
        if (hints.weatherSensorOk === true) {
          return { key, presence: 'PRESENT', value: { source: 'live_weather' } };
        }
        if (hints.weatherSensorOk === false) {
          return { key, presence: 'UNKNOWN', noteZh: 'weather_sensor_failed' };
        }
        return { key, presence: 'UNKNOWN', noteZh: 'weather_not_fetched' };
      case 'day_activity_seed':
        if (hints.dayActivityCount != null) {
          return {
            key,
            presence: 'PRESENT',
            value: { count: hints.dayActivityCount },
            noteZh:
              hints.dayActivityCount === 0 ? '当日无活动种子，节奏判断宜保守' : undefined,
          };
        }
        return { key, presence: 'UNKNOWN' };
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
