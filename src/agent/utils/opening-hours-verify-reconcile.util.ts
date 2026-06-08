/**
 * 出站前对照「当前 itinerary + opening_hours_evidence」复核开放时间类 VERIFY 提示，
 * 剔除改时段后的陈旧项与季节性文案误报（与 itinerary.verify / 排期逻辑对齐）。
 */

import { DateTime } from 'luxon';
import { resolveItineraryItemOpeningHours } from './opening-hours-evidence-hydration.util';
import { openingHoursEvidenceToText } from './itinerary-item-add-slot.util';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import {
  minutesFromDestinationDayStart,
  parseItineraryWindowInDestinationLocal,
  resolveDestinationTimezoneForVerify,
} from './verify-opening-hours-timezone.util';
import { hasResolvableOpeningHours, openingHoursToEvidenceString } from '../../common/utils/resolve-place-opening-hours.util';
import { OpeningHoursUtil } from '../../common/utils/opening-hours.util';

type IndexedItem = {
  itemId: string;
  date: string;
  name: string;
  startWindow: string;
};

function buildItineraryItemIndex(itinerary: Itinerary): Map<string, IndexedItem> {
  const map = new Map<string, IndexedItem>();
  for (const day of itinerary.days ?? []) {
    const date = String(day.date ?? '').slice(0, 10);
    for (const item of day.items ?? []) {
      map.set(String(item.id), {
        itemId: String(item.id),
        date,
        name: String(item.location_ref?.name ?? '').trim(),
        startWindow: String(item.start_window ?? '').trim(),
      });
    }
  }
  return map;
}

export function parsePoiNameFromOpeningHoursVerifyText(detail: string): string | undefined {
  const m = detail.match(/POI\s+"([^"]+)"/);
  return m?.[1]?.trim() || undefined;
}

function parseDateFromVerifyText(detail: string): string | undefined {
  const m = detail.match(/在\s+(\d{4}-\d{2}-\d{2})/);
  return m?.[1];
}

function parseScheduledTimeFromVerifyText(detail: string): string | undefined {
  const withDate = detail.match(/在\s+\d{4}-\d{2}-\d{2}\s+(\d{1,2}:\d{2})/);
  if (withDate?.[1]) return withDate[1];
  const hmOnly = detail.match(/在\s+(\d{1,2}:\d{2})(?:\s|，|,|$)/);
  return hmOnly?.[1];
}

function normalizeHm(hm: string): string {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hm.trim();
  return `${Number(m[1])}:${m[2].padStart(2, '0')}`;
}

function parseTimeWindowHm(timeWindow: string, dayIso: string, timezone: string): DateTime | null {
  return parseItineraryWindowInDestinationLocal(dayIso, timeWindow, timezone);
}

function resolveHoursForTripDay(raw: unknown, dayIso: string, timezone: string): string | undefined {
  const dayDate = DateTime.fromISO(String(dayIso).slice(0, 10), { zone: timezone });
  const seasonal = openingHoursEvidenceToText(raw, dayDate.toJSDate(), timezone);
  if (seasonal && seasonal !== 'Closed') return seasonal;
  return openingHoursToEvidenceString(raw);
}

function openingHoursTimezone(researchData?: Record<string, unknown>): string {
  return resolveDestinationTimezoneForVerify({ researchData });
}

/** VERIFY 文案中的计划时刻与 itinerary 当前 start_window 不一致 → 陈旧提示 */
export function isOpeningHoursScheduledTimeStaleForItinerary(
  detail: string,
  itinerary: Itinerary,
): boolean {
  const msgTime = parseScheduledTimeFromVerifyText(detail);
  if (!msgTime) return false;

  const index = buildItineraryItemIndex(itinerary);
  const itemId = detail.match(/\[entity:POI:([^\]]+)\]/i)?.[1]?.trim();
  const poiName = parsePoiNameFromOpeningHoursVerifyText(detail);
  const date = parseDateFromVerifyText(detail);

  let currentStart: string | undefined;
  if (itemId) {
    currentStart = index.get(itemId)?.startWindow;
  } else if (poiName && date) {
    currentStart = [...index.values()].find((x) => x.name === poiName && x.date === date)?.startWindow;
  } else if (poiName) {
    const matches = [...index.values()].filter((x) => x.name === poiName);
    if (matches.length === 1) currentStart = matches[0].startWindow;
  }

  if (!currentStart) return false;
  return normalizeHm(msgTime) !== normalizeHm(currentStart);
}

/** 按当前行程与证据重算：若计划时段已在营业窗内，则视为误报并剔除 */
export function isOpeningHoursVerifyIssueFalsePositive(
  detail: string,
  itinerary: Itinerary,
  researchData?: Record<string, unknown>,
): boolean {
  if (!researchData?.opening_hours_evidence) return false;

  const poiName = parsePoiNameFromOpeningHoursVerifyText(detail);
  if (!poiName) return false;

  const msgDate = parseDateFromVerifyText(detail);
  const tz = openingHoursTimezone(researchData);

  for (const day of itinerary.days ?? []) {
    const dayDateStr = String(day.date ?? '').slice(0, 10);
    if (msgDate && dayDateStr && msgDate !== dayDateStr) continue;

    for (const item of day.items ?? []) {
      const name = String(item.location_ref?.name ?? '').trim();
      if (name !== poiName) continue;

      const start = String(item.start_window ?? '').trim();
      const end = String(item.end_window ?? '').trim();
      if (!start || !end) continue;

      const startTime = parseTimeWindowHm(start, dayDateStr, tz);
      if (!startTime) continue;

      const resolved = resolveItineraryItemOpeningHours(item, researchData);
      if (!resolved || !hasResolvableOpeningHours(resolved.opening_hours)) continue;

      const hoursForDay = resolveHoursForTripDay(resolved.opening_hours, dayDateStr, tz);
      if (!hoursForDay) continue;

      if (OpeningHoursUtil.isOpenAt(hoursForDay, startTime.toJSDate(), tz)) {
        return true;
      }
    }
  }

  return false;
}

export function shouldSuppressOpeningHoursVerifyIssue(
  detail: string,
  itinerary: Itinerary | null | undefined,
  researchData?: Record<string, unknown>,
): boolean {
  if (!itinerary?.days?.length) return false;
  if (isOpeningHoursScheduledTimeStaleForItinerary(detail, itinerary)) return true;
  if (isOpeningHoursVerifyIssueFalsePositive(detail, itinerary, researchData)) return true;
  return false;
}
