/**
 * POI_SLOT_FILL：根据现有行程向空档日/稀疏日追加推荐景点（只增不删，SEMI_AUTO 落库）。
 */

import type { Itinerary, ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import {
  detectExplicitSingleDayAdjustAnchor,
  detectFullTripReplanIntent,
  type ItineraryAdjustDateRange,
} from './itinerary-adjust-intent.util';
import {
  isPlausibleItineraryItemAddPoiQuery,
  parseItineraryItemAddSpec,
} from './itinerary-item-add.util';
import type { TripDayLikeForDelete, TripItemLikeForDelete, TripLikeForDelete } from './itinerary-item-delete.util';
import {
  buildAppendOnlyDayApplyEdits,
  collectPoiItemsForCorridorApply,
  parseNumericPlaceId,
  type CorridorApplyEdit,
  pickTargetDayFromItinerary,
} from './itinerary-adjust-corridor-apply.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

export const POI_SLOT_FILL_SPARSE_MAX_ACTIVITIES = 1;

const POI_SLOT_FILL_PATTERNS: RegExp[] = [
  /根据.{0,32}(?:我的|当前|现有)?(?:行程|计划|安排)/,
  /(?:推荐|建议).{0,24}(?:适合)?(?:加入|添加|安排|放进)/,
  /(?:适合|可以).{0,12}(?:加入|添加|安排).{0,16}(?:景点|活动|去处|地方)/,
  /有什么.{0,12}(?:推荐|建议).{0,20}(?:景点|活动|去处)/,
  /(?:还能|可以).{0,8}(?:去|玩|逛).{0,8}(?:哪些|什么)/,
  /推荐.{0,16}(?:一些|几个).{0,12}(?:景点|活动|去处)/,
];

const POI_SLOT_FILL_BLOCKERS: RegExp[] = [
  /重新规划|直接重排|明显不合理/,
  /把.{0,32}(?:改成|改为|调整|重排|换掉)/,
  /(?:就|请).{0,8}(?:改|调整|重排|更新).{0,12}(?:行程|第二天|第\s*\d+\s*天)/,
];

const HOTEL_CATEGORIES = new Set(['HOTEL', 'STAY', 'ACCOMMODATION', 'LODGING']);

export type PoiSlotFillDayTarget = {
  dateIso: string;
  dayNumber: number;
  existingActivityCount: number;
};

function tripDays(trip: TripLikeForDelete): TripDayLikeForDelete[] {
  if (Array.isArray(trip.days) && trip.days.length) return trip.days;
  return trip.TripDay ?? [];
}

function formatTripDayDateIso(date: Date | string | null | undefined): string | undefined {
  if (!date) return undefined;
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  const s = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return undefined;
}

function isHotelLikeItem(item: TripItemLikeForDelete): boolean {
  const placeMeta = (item.Place ?? item.place) as { category?: string } | null | undefined;
  const cat = String(placeMeta?.category ?? '').toUpperCase();
  const name = String(item.Place?.nameCN ?? item.Place?.nameEN ?? item.place?.nameCN ?? '').trim();
  return (
    HOTEL_CATEGORIES.has(cat) ||
    /HOTEL|STAY|ACCOMMODATION|住宿|酒店/i.test(cat) ||
    /住宿|酒店/i.test(name)
  );
}

export function countTripDayActivityItems(items: TripItemLikeForDelete[]): number {
  return items.filter((it) => {
    if (isHotelLikeItem(it)) return false;
    return !!(it.placeId ?? it.Place?.id ?? it.place?.id);
  }).length;
}

export function collectSparseTripDayTargets(
  trip: TripLikeForDelete,
  options?: { maxActivities?: number; maxDays?: number },
): PoiSlotFillDayTarget[] {
  const maxActivities = options?.maxActivities ?? POI_SLOT_FILL_SPARSE_MAX_ACTIVITIES;
  const maxDays = options?.maxDays ?? 6;
  const days = tripDays(trip);
  const targets: PoiSlotFillDayTarget[] = [];

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dateIso = formatTripDayDateIso(day.date);
    if (!dateIso) continue;
    const items = Array.isArray(day.items) && day.items.length ? day.items : day.ItineraryItem ?? [];
    const activityCount = countTripDayActivityItems(items);
    if (activityCount <= maxActivities) {
      targets.push({
        dateIso,
        dayNumber: i + 1,
        existingActivityCount: activityCount,
      });
    }
  }

  return targets.slice(0, maxDays);
}

/** 用户是否在已有行程语境下请求「推荐适合加入的景点」（补空档，非整日重排） */
export function detectPoiSlotFillIntent(
  message: string,
  dateRange?: ItineraryAdjustDateRange,
): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  if (detectFullTripReplanIntent(t, dateRange)) return false;
  if (POI_SLOT_FILL_BLOCKERS.some((re) => re.test(t))) return false;

  if (
    detectExplicitSingleDayAdjustAnchor(t, dateRange) &&
    /重新规划|重排|替换|改写|更新为|明显不合理/.test(t)
  ) {
    return false;
  }

  const genericRecommendTailRe =
    /(?:一些|几个|适合|推荐|哪些|什么|的)?(?:景点|活动|去处|地方)\s*$/u;
  const addSpec = parseItineraryItemAddSpec(t);
  if (
    addSpec?.poiQuery &&
    isPlausibleItineraryItemAddPoiQuery(addSpec.poiQuery) &&
    !genericRecommendTailRe.test(addSpec.poiQuery)
  ) {
    return false;
  }

  if (!POI_SLOT_FILL_PATTERNS.some((re) => re.test(t))) return false;
  return /(?:行程|计划|itinerary|安排|景点|活动)/i.test(t);
}

export function appendPoiSlotFillSystemHints(trip: { message?: string }, message: string): void {
  const block =
    `[SYSTEM_MESSAGE][POI_SLOT_FILL]\n` +
    `User requested POI recommendations to append into sparse day slots on bound trip (append-only, do not delete existing items).\n` +
    `- Prefer days with 0–1 existing activities; keep hotels and confirmed items unchanged.\n` +
    `- Each recommended POI must carry a resolvable place_id from poi.search / poi_evidence.\n`;
  trip.message = `${block}${trip.message ?? ''}`.trim();
}

export function collectResearchPools(research: Record<string, unknown> | undefined): unknown[][] {
  const pools: unknown[][] = [];
  const poiEvidence = research?.poi_evidence as { pois?: unknown[] } | undefined;
  if (Array.isArray(poiEvidence?.pois)) pools.push(poiEvidence.pois);
  if (Array.isArray(research?.pois)) pools.push(research.pois as unknown[]);
  return pools;
}

export function resolvePlaceIdFromResearchPools(
  name: string,
  placeIdRaw: unknown,
  pools: unknown[][],
): number | undefined {
  const numeric = parseNumericPlaceId(placeIdRaw);
  if (numeric != null) return numeric;
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return undefined;

  for (const pool of pools) {
    for (const row of pool) {
      const p = row as Record<string, unknown>;
      const label = String(p.name ?? p.nameCN ?? p.nameEN ?? '').trim();
      if (!label) continue;
      if (label === trimmed || label.includes(trimmed) || trimmed.includes(label)) {
        const id = parseNumericPlaceId(p.id ?? p.poi_id ?? p.place_id);
        if (id != null) return id;
      }
    }
  }
  return undefined;
}

export function enrichItineraryWithPlaceIdsFromResearch(
  itinerary: Itinerary | undefined,
  pools: unknown[][],
): number {
  if (!itinerary?.days?.length) return 0;
  let bound = 0;
  for (const day of itinerary.days) {
    for (const item of day.items ?? []) {
      if (!item.location_ref) {
        item.location_ref = { name: '' };
      }
      const existing = parseNumericPlaceId(item.location_ref.place_id);
      if (existing != null) continue;
      const name = String(item.location_ref.name ?? '').trim();
      const resolved = resolvePlaceIdFromResearchPools(name, item.location_ref.place_id, pools);
      if (resolved != null) {
        item.location_ref.place_id = String(resolved);
        bound++;
      }
    }
  }
  return bound;
}

function normalizeItemNameKey(name: string): string {
  return String(name ?? '').trim().toLowerCase();
}

function existingTripDayNameKeys(items: TripItemLikeForDelete[]): Set<string> {
  const keys = new Set<string>();
  for (const it of items) {
    const name = String(it.Place?.nameCN ?? it.Place?.nameEN ?? it.place?.nameCN ?? it.note ?? '').trim();
    if (name) keys.add(normalizeItemNameKey(name));
    const pid = it.placeId ?? it.Place?.id ?? it.place?.id;
    if (pid != null) keys.add(`id:${pid}`);
  }
  return keys;
}

function isNewDraftPoiItem(item: ItineraryItem, existingKeys: Set<string>): boolean {
  const placeId = parseNumericPlaceId(item.location_ref?.place_id);
  if (placeId != null && existingKeys.has(`id:${placeId}`)) return false;
  const name = normalizeItemNameKey(String(item.location_ref?.name ?? ''));
  if (name && existingKeys.has(name)) return false;
  return true;
}

export function extractNewPoiItemsForSparseDay(
  draftDay: ItineraryDay | undefined,
  existingTripItems: TripItemLikeForDelete[],
): ItineraryItem[] {
  if (!draftDay?.items?.length) return [];
  const existingKeys = existingTripDayNameKeys(existingTripItems);
  return collectPoiItemsForCorridorApply(draftDay).filter((item) =>
    isNewDraftPoiItem(item, existingKeys),
  );
}

export function buildPoiSlotFillAppendEdits(params: {
  trip: TripLikeForDelete;
  sparseTargets: PoiSlotFillDayTarget[];
  draftDays: ItineraryDay[];
  resolvePlaceId: (item: ItineraryItem) => number | undefined;
}): {
  edits: CorridorApplyEdit[];
  addCount: number;
  unresolvedItems: string[];
  appliedDays: string[];
} {
  const edits: CorridorApplyEdit[] = [];
  const unresolvedItems: string[] = [];
  const appliedDays: string[] = [];
  let addCount = 0;

  const tripDayList = tripDays(params.trip);

  for (const target of params.sparseTargets) {
    const tripDay = tripDayList.find(
      (d) => formatTripDayDateIso(d.date) === target.dateIso.slice(0, 10),
    );
    if (!tripDay?.id) continue;

    const existingItems =
      Array.isArray(tripDay.items) && tripDay.items.length
        ? tripDay.items
        : tripDay.ItineraryItem ?? [];

    const draftDay = pickTargetDayFromItinerary({ days: params.draftDays }, target.dateIso);
    const newItems = extractNewPoiItemsForSparseDay(draftDay, existingItems);
    if (!newItems.length) continue;

    const tripDayDate = tripDay.date ?? target.dateIso;
    const { edits: dayEdits, addCount: dayAdd, unresolvedItems: dayUnresolved } =
      buildAppendOnlyDayApplyEdits({
        tripDayId: tripDay.id,
        tripDayDate,
        items: newItems,
        resolvePlaceId: params.resolvePlaceId,
      });

    if (dayUnresolved.length > 0) {
      unresolvedItems.push(...dayUnresolved);
    }
    if (dayAdd > 0) {
      edits.push(...dayEdits);
      addCount += dayAdd;
      appliedDays.push(target.dateIso.slice(0, 10));
    }
  }

  return { edits, addCount, unresolvedItems, appliedDays };
}

/** 将编排草案与库内 Trip 合并：非稀疏日保留 Trip，稀疏日 = Trip + 草案新增 POI */
export function mergePoiSlotFillOrchestratorItinerary(params: {
  orchestrator: Itinerary | undefined;
  trip: TripLikeForDelete;
  sparseTargets: PoiSlotFillDayTarget[];
}): Itinerary | undefined {
  const orchDays = params.orchestrator?.days ?? [];
  if (!orchDays.length) return params.orchestrator;

  const sparseDates = new Set(params.sparseTargets.map((t) => t.dateIso.slice(0, 10)));
  const tripDayList = tripDays(params.trip);
  const mergedDays: ItineraryDay[] = [];

  for (let i = 0; i < Math.max(tripDayList.length, orchDays.length); i++) {
    const tripDay = tripDayList[i];
    const dateIso =
      formatTripDayDateIso(tripDay?.date) ??
      String(orchDays[i]?.date ?? '').slice(0, 10);
    if (!dateIso) continue;

    const orchDay = orchDays.find((d) => String(d.date ?? '').slice(0, 10) === dateIso) ?? orchDays[i];
    const isSparse = sparseDates.has(dateIso);

    if (!isSparse) {
      const tripItems: ItineraryItem[] = tripDay
        ? (Array.isArray(tripDay.items) && tripDay.items.length
            ? tripDay.items
            : tripDay.ItineraryItem ?? []
          ).map((it, idx) => ({
            id: it.id ?? `trip-${dateIso}-${idx}`,
            type: 'POI' as const,
            start_window: it.startTime
              ? String(it.startTime instanceof Date ? it.startTime.toISOString() : it.startTime).slice(11, 16)
              : '09:00',
            end_window: it.endTime
              ? String(it.endTime instanceof Date ? it.endTime.toISOString() : it.endTime).slice(11, 16)
              : '12:00',
            location_ref: {
              name: String(it.Place?.nameCN ?? it.Place?.nameEN ?? it.note ?? '').trim(),
              place_id:
                it.placeId != null
                  ? String(it.placeId)
                  : it.Place?.id != null
                    ? String(it.Place.id)
                    : undefined,
            },
            evidence_refs: [],
            verified: true,
          }))
        : (orchDay?.items ?? []);

      mergedDays.push({ date: dateIso, items: tripItems });
      continue;
    }

    const existingTripItems =
      Array.isArray(tripDay?.items) && tripDay!.items!.length
        ? tripDay!.items!
        : tripDay?.ItineraryItem ?? [];
    const tripItems: ItineraryItem[] = existingTripItems.map((it, idx) => ({
      id: it.id ?? `trip-${dateIso}-${idx}`,
      type: 'POI' as const,
      start_window: it.startTime
        ? String(it.startTime instanceof Date ? it.startTime.toISOString() : it.startTime).slice(11, 16)
        : '09:00',
      end_window: it.endTime
        ? String(it.endTime instanceof Date ? it.endTime.toISOString() : it.endTime).slice(11, 16)
        : '12:00',
      location_ref: {
        name: String(it.Place?.nameCN ?? it.Place?.nameEN ?? it.note ?? '').trim(),
        place_id:
          it.placeId != null
            ? String(it.placeId)
            : it.Place?.id != null
              ? String(it.Place.id)
              : undefined,
      },
      evidence_refs: [],
      verified: true,
    }));

    const newDraftItems = extractNewPoiItemsForSparseDay(orchDay, existingTripItems);
    mergedDays.push({
      date: dateIso,
      items: [...tripItems, ...newDraftItems.map((it) => ({ ...it }))],
    });
  }

  return {
    request_id: params.orchestrator?.request_id ?? 'poi-slot-fill-merge',
    days: mergedDays,
  };
}

export function allNewPoiItemsHavePlaceIds(
  draftDays: ItineraryDay[],
  sparseTargets: PoiSlotFillDayTarget[],
  trip: TripLikeForDelete,
): boolean {
  const tripDayList = tripDays(trip);
  for (const target of sparseTargets) {
    const tripDay = tripDayList.find(
      (d) => formatTripDayDateIso(d.date) === target.dateIso.slice(0, 10),
    );
    const existingItems =
      Array.isArray(tripDay?.items) && tripDay!.items!.length
        ? tripDay!.items!
        : tripDay?.ItineraryItem ?? [];
    const draftDay = draftDays.find((d) => String(d.date ?? '').slice(0, 10) === target.dateIso);
    const newItems = extractNewPoiItemsForSparseDay(draftDay, existingItems);
    for (const item of newItems) {
      if (parseNumericPlaceId(item.location_ref?.place_id) == null) {
        return false;
      }
    }
  }
  return true;
}
