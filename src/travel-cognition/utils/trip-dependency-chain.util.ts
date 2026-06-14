/**
 * 从行程项提取航班→接驳→入住→当日计划依赖链（启发式 v0）。
 */

import type { TravelEntityRef } from '../types/travel-entity-ref.types';

export type TripDependencyChainRole =
  | 'flight'
  | 'transfer'
  | 'check_in'
  | 'day_plan'
  | 'drive'
  | 'poi'
  | 'road_leg';

export interface TripDependencyChainNode {
  role: TripDependencyChainRole;
  entityRef: TravelEntityRef;
  /** 计划时刻 ISO 8601 */
  plannedTime: string;
  durationMinutes?: number;
  label?: string;
  /** 所属日期 YYYY-MM-DD（冰岛场景级联用） */
  dayDate?: string;
  /** 暴露类型：outdoor POI 受天气窗口影响 */
  exposure?: 'indoor' | 'outdoor' | 'mixed';
  /** 是否 F-road / 高地路段 */
  isFroad?: boolean;
}

export interface TripItineraryItemLike {
  id: string;
  type: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  note?: string | null;
  metadata?: unknown;
  dayDate?: string;
  placeName?: string;
  placeId?: string | number;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFlightItem(item: TripItineraryItemLike): boolean {
  const meta = isRecord(item.metadata) ? item.metadata : {};
  if (meta.flight || meta.flightNumber || meta.flight_number) return true;
  const note = String(item.note ?? '');
  return /\b[A-Z]{2}\d{2,4}\b/.test(note) || /航班/.test(note);
}

function isAccommodationItem(item: TripItineraryItemLike): boolean {
  const type = item.type.toUpperCase();
  if (type.includes('ACCOMMODATION') || type.includes('HOTEL')) return true;
  const meta = isRecord(item.metadata) ? item.metadata : {};
  return Boolean(meta.hotel || meta.accommodation || meta.checkIn);
}

function isTransferItem(item: TripItineraryItemLike): boolean {
  const type = item.type.toUpperCase();
  return type === 'TRANSIT' || type === 'DRIVE' || type.includes('TRANSIT');
}

function isDayActivityItem(item: TripItineraryItemLike): boolean {
  const type = item.type.toUpperCase();
  return type === 'ACTIVITY' || type === 'POI' || type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING';
}

function entityRefForItem(item: TripItineraryItemLike, kind: TravelEntityRef['kind']): TravelEntityRef {
  const label = item.placeName || item.note || item.id;
  const ref: TravelEntityRef = {
    kind,
    id: item.placeId != null ? String(item.placeId) : `itinerary-item:${item.id}`,
    label: label ? String(label) : undefined,
  };
  return ref;
}

/**
 * 按时间排序后，从首个航班项向后匹配接驳 / 入住 / 当日活动。
 */
export function extractTripDependencyChain(
  items: TripItineraryItemLike[],
): TripDependencyChainNode[] {
  const sorted = [...items]
    .map((item) => ({
      item,
      startIso: toIso(item.startTime),
    }))
    .filter((row) => row.startIso)
    .sort((a, b) => Date.parse(a.startIso!) - Date.parse(b.startIso!));

  const flightIndex = sorted.findIndex((row) => isFlightItem(row.item));
  if (flightIndex < 0) return [];

  const chain: TripDependencyChainNode[] = [];
  const flightRow = sorted[flightIndex];
  const flightEnd = toIso(flightRow.item.endTime) ?? flightRow.startIso!;

  chain.push({
    role: 'flight',
    entityRef: entityRefForItem(flightRow.item, 'AIRPORT'),
    plannedTime: flightEnd,
    label: flightRow.item.placeName || String(flightRow.item.metadata && isRecord(flightRow.item.metadata) ? flightRow.item.metadata.flight : '') || 'Flight',
  });

  const afterFlight = sorted.slice(flightIndex + 1);

  const transfer = afterFlight.find((row) => isTransferItem(row.item) && !isFlightItem(row.item));
  if (transfer) {
    const meta = isRecord(transfer.item.metadata) ? transfer.item.metadata : {};
    const duration =
      typeof meta.duration_minutes === 'number'
        ? meta.duration_minutes
        : typeof meta.travelFromPreviousDuration === 'number'
          ? meta.travelFromPreviousDuration
          : undefined;
    chain.push({
      role: 'transfer',
      entityRef: entityRefForItem(transfer.item, 'SEGMENT'),
      plannedTime: transfer.startIso!,
      durationMinutes: duration,
      label: transfer.item.placeName || transfer.item.note || 'Ground transfer',
    });
  }

  const checkIn = afterFlight.find((row) => isAccommodationItem(row.item));
  if (checkIn) {
    chain.push({
      role: 'check_in',
      entityRef: entityRefForItem(checkIn.item, 'HOTEL_AREA'),
      plannedTime: checkIn.startIso!,
      label: checkIn.item.placeName || 'Hotel check-in',
    });
  }

  const dayPlan = afterFlight.find((row) => isDayActivityItem(row.item));
  if (dayPlan) {
    chain.push({
      role: 'day_plan',
      entityRef: {
        kind: 'DAY',
        id: dayPlan.item.dayDate ?? dayPlan.item.id,
        label: dayPlan.item.dayDate ? `Day ${dayPlan.item.dayDate}` : dayPlan.item.placeName,
      },
      plannedTime: dayPlan.startIso!,
      label: dayPlan.item.placeName || 'First activity',
    });
  }

  return chain;
}

function isDriveItem(item: TripItineraryItemLike): boolean {
  const type = item.type.toUpperCase();
  return type === 'DRIVE' || type.includes('DRIVE');
}

function resolveExposure(item: TripItineraryItemLike): 'indoor' | 'outdoor' | 'mixed' | undefined {
  const meta = isRecord(item.metadata) ? item.metadata : {};
  const raw = meta.indoorOutdoor ?? meta.indoor_outdoor ?? meta.exposure;
  if (raw === 'indoor' || raw === 'outdoor' || raw === 'mixed') return raw;
  const type = item.type.toUpperCase();
  if (type.includes('NATURE') || type === 'ACTIVITY') return 'outdoor';
  return undefined;
}

function resolveIsFroad(item: TripItineraryItemLike): boolean {
  const meta = isRecord(item.metadata) ? item.metadata : {};
  if (meta.isFroad === true || meta.fRoad === true || meta.roadType === 'F') return true;
  const note = String(item.note ?? item.placeName ?? '');
  return /\bf[- ]?road\b/i.test(note) || /\bF\d{3}\b/i.test(note);
}

/**
 * 冰岛场景：按时间提取驾车段、POI、当日计划锚点（用于封路 / 天气 / F-road 级联）。
 */
export function extractIcelandActivityDependencyChain(
  items: TripItineraryItemLike[],
): TripDependencyChainNode[] {
  const sorted = [...items]
    .map((item) => ({
      item,
      startIso: toIso(item.startTime),
    }))
    .filter((row) => row.startIso)
    .sort((a, b) => Date.parse(a.startIso!) - Date.parse(b.startIso!));

  const chain: TripDependencyChainNode[] = [];
  const dayAnchors = new Set<string>();

  for (const row of sorted) {
    const { item, startIso } = row;
    const dayDate = item.dayDate;
    const endIso = toIso(item.endTime);

    if (isDriveItem(item)) {
      chain.push({
        role: 'drive',
        entityRef: entityRefForItem(item, 'SEGMENT'),
        plannedTime: startIso!,
        durationMinutes: isRecord(item.metadata)
          ? (item.metadata.duration_minutes as number | undefined) ??
            (item.metadata.travelFromPreviousDuration as number | undefined)
          : undefined,
        label: item.placeName || item.note || 'Drive segment',
        dayDate,
        isFroad: resolveIsFroad(item),
      });
      continue;
    }

    if (isDayActivityItem(item) || isAccommodationItem(item)) {
      chain.push({
        role: 'poi',
        entityRef: entityRefForItem(item, 'POI'),
        plannedTime: startIso!,
        label: item.placeName || item.note || 'Activity',
        dayDate,
        exposure: resolveExposure(item),
      });

      if (dayDate && !dayAnchors.has(dayDate)) {
        dayAnchors.add(dayDate);
        chain.push({
          role: 'day_plan',
          entityRef: {
            kind: 'DAY',
            id: dayDate,
            label: `Day ${dayDate}`,
          },
          plannedTime: startIso!,
          label: item.placeName || `Day ${dayDate}`,
          dayDate,
        });
      }
    }
  }

  return chain;
}

/**
 * 合并航班链与冰岛活动链（按 plannedTime 排序）。
 */
export function extractFullTripDependencyChain(
  items: TripItineraryItemLike[],
): TripDependencyChainNode[] {
  const flightChain = extractTripDependencyChain(items);
  const icelandChain = extractIcelandActivityDependencyChain(items);
  if (flightChain.length === 0) return icelandChain;
  if (icelandChain.length === 0) return flightChain;
  return [...flightChain, ...icelandChain].sort(
    (a, b) => Date.parse(a.plannedTime) - Date.parse(b.plannedTime),
  );
}
