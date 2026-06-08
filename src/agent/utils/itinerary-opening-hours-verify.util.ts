/**
 * 行程开放时间校验（itinerary.verify 与 workbench 出站重算共用）。
 */

import { DateTime } from 'luxon';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';
import {
  hasResolvableOpeningHours,
  openingHoursToEvidenceString,
} from '../../common/utils/resolve-place-opening-hours.util';
import { openingHoursEvidenceToText } from './itinerary-item-add-slot.util';
import { resolveItineraryItemOpeningHours } from './opening-hours-evidence-hydration.util';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { ConstraintViolation } from '../services/route-feasibility.types';
import {
  minutesFromDestinationDayStart,
  parseItineraryWindowInDestinationLocal,
  resolveDestinationTimezoneForVerify,
} from './verify-opening-hours-timezone.util';
import { normalizePoiIdKey } from '../../common/utils/resolve-place-opening-hours.util';

export type ItineraryOpeningHoursVerifyIssue = {
  type: 'OPENING_HOURS_CONFLICT';
  severity: 'ERROR' | 'WARNING';
  item_id?: string;
  day?: string;
  message: string;
  suggestion?: string;
  violation?: ConstraintViolation;
};

function resolveHoursForTripDay(raw: unknown, dayDate: DateTime, timezone: string): string | undefined {
  const tripDay = dayDate.toJSDate();
  const seasonal = openingHoursEvidenceToText(raw, tripDay, timezone);
  if (seasonal && seasonal !== 'Closed') return seasonal;
  return openingHoursToEvidenceString(raw);
}

function inferOpenCloseMinutes(
  resolvedHoursStr: string,
  dayIso: string,
  timezone: string,
): { openMin: number; closeMin: number } | undefined {
  if (!resolvedHoursStr.includes('-')) return undefined;
  const [openTime, closeTime] = resolvedHoursStr.split('-');
  const dayDate = DateTime.fromISO(String(dayIso).slice(0, 10), { zone: timezone });
  const o = parseItineraryWindowInDestinationLocal(dayIso, openTime.trim(), timezone);
  const c = parseItineraryWindowInDestinationLocal(dayIso, closeTime.trim(), timezone);
  if (!o || !c) return undefined;
  return {
    openMin: minutesFromDestinationDayStart(dayIso, o, timezone),
    closeMin: minutesFromDestinationDayStart(dayIso, c, timezone),
  };
}

/** 对 itinerary 做开放时间校验；start_window 按目的地当地 wall-clock 解析 */
export function collectItineraryOpeningHoursVerifyIssues(
  itinerary: Itinerary,
  researchData?: Record<string, unknown>,
): ItineraryOpeningHoursVerifyIssue[] {
  const issues: ItineraryOpeningHoursVerifyIssue[] = [];
  const openingHoursData = researchData?.opening_hours_evidence;
  if (!openingHoursData) return issues;

  const timezone = resolveDestinationTimezoneForVerify({ researchData });

  for (const day of itinerary.days ?? []) {
    const dayIso = String(day.date ?? '').slice(0, 10);
    if (!dayIso) continue;

    for (const item of day.items ?? []) {
      const itemType = String(item.type ?? 'POI').toUpperCase();
      if (itemType !== 'POI' && itemType !== 'ACTIVITY' && itemType !== 'VIEWPOINT' && itemType !== 'NATURE') {
        continue;
      }
      if (!item.location_ref?.place_id) continue;

      const poiId = normalizePoiIdKey(item.location_ref.place_id);
      if (!poiId) continue;

      const resolved = resolveItineraryItemOpeningHours(item, researchData);
      const openingHoursInfo = resolved
        ? { opening_hours: resolved.opening_hours, is_open_now: resolved.is_open_now }
        : undefined;

      const dayDate = DateTime.fromISO(dayIso, { zone: timezone });
      const hoursForDay = openingHoursInfo
        ? resolveHoursForTripDay(openingHoursInfo.opening_hours, dayDate, timezone)
        : undefined;

      if (
        !openingHoursInfo ||
        (!hoursForDay && !hasResolvableOpeningHours(openingHoursInfo.opening_hours))
      ) {
        issues.push({
          type: 'OPENING_HOURS_CONFLICT',
          severity: 'WARNING',
          item_id: item.id,
          day: day.date,
          message: `POI "${item.location_ref.name}" 缺少开放时间数据`,
          suggestion: '请确认该地点在指定时间是否开放',
          violation: {
            anchor: { constraintId: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP, ruleId: 'temporal_opening_v1' },
            entityRef: { type: 'POI', id: item.id },
            evidence: { source: 'OPENING_HOURS' },
            scope: 'LOCAL',
          },
        });
        continue;
      }

      const startTime = parseItineraryWindowInDestinationLocal(dayIso, item.start_window, timezone);
      const endTime = parseItineraryWindowInDestinationLocal(dayIso, item.end_window, timezone);

      if (startTime && endTime && hoursForDay) {
        const checkDate = startTime.toJSDate();
        if (!OpeningHoursUtil.isOpenAt(hoursForDay, checkDate, timezone)) {
          const inferred = inferOpenCloseMinutes(hoursForDay, dayIso, timezone);
          const startMin = minutesFromDestinationDayStart(dayIso, startTime, timezone);
          const endMin = minutesFromDestinationDayStart(dayIso, endTime, timezone);
          const metric: ConstraintViolation['metric'] | undefined = inferred
            ? (() => {
                const { openMin, closeMin } = inferred;
                if (startMin < openMin) {
                  return { cmp: 'GEQ', actual: startMin, limit: openMin, unit: 'min', slack: startMin - openMin };
                }
                if (endMin > closeMin) {
                  return { cmp: 'LEQ', actual: endMin, limit: closeMin, unit: 'min', slack: closeMin - endMin };
                }
                return undefined;
              })()
            : undefined;
          issues.push({
            type: 'OPENING_HOURS_CONFLICT',
            severity: 'ERROR',
            item_id: item.id,
            day: day.date,
            message: `POI "${item.location_ref.name}" 在 ${item.start_window} 不在开放时间内`,
            suggestion: `开放时间：${hoursForDay}`,
            violation: {
              anchor: { constraintId: CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP, ruleId: 'temporal_opening_v1' },
              entityRef: { type: 'POI', id: item.id },
              ...(metric ? { metric } : {}),
              evidence: { source: 'OPENING_HOURS' },
              scope: 'LOCAL',
            },
          });
        }
      }
    }
  }

  return issues;
}
