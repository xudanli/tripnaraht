// src/agent/services/route-run-itinerary-poi-hydrator.service.ts
/**
 * route_and_run 成功返回前：根据 itinerary 中的 POI 条目批量查 Place 表，
 * 供前端渲染 POI 卡片（展示字段以数据库登记为准，编排草稿仅作时间与关联键）。
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Itinerary, ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';

export type RouteRunPoiCardMatchedFrom =
  | 'place_id'
  | 'place_uuid'
  | 'place_google_id'
  | 'name_exact'
  | 'itinerary_only';

/** 解析 `location_ref.place_id`：纯数字主键 / UUID / Google Place Id */
export type PlaceRefClassification =
  | { kind: 'numeric_id'; id: number }
  | { kind: 'uuid'; uuid: string }
  | { kind: 'google_place_id'; google_place_id: string };

/** 单张 POI 卡片（与行程条目对齐；前端可直接绑定） */
export interface RouteRunPoiCard {
  place_id: number | null;
  uuid: string | null;
  itinerary_item_id: string;
  day_index: number;
  date: string;
  item_type: string;
  start_window: string;
  end_window: string;
  /** 编排草稿里的名称（非库内权威名称；权威见 name_cn / display_name 来自 Place） */
  itinerary_name: string;
  name_cn: string | null;
  name_en: string | null;
  display_name: string;
  category: string | null;
  rating: number | null;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  tags: string[];
  matched_from: RouteRunPoiCardMatchedFrom;
  /** 来自 `Place.ontologyRules`（JSON）；库内未配置时为 null */
  ontologyRules: unknown | null;
  /** true：展示字段已对齐 Place 表；false：仅有行程草案或名称模糊命中 */
  resolved_from_place_registry: boolean;
}

export interface RouteRunPoiHydrationPayload {
  poi_cards: RouteRunPoiCard[];
  poi_cards_by_day: Array<{
    day_index: number;
    date: string;
    cards: RouteRunPoiCard[];
  }>;
}

/**
 * 将 Hydrator 产出的展示名（优先 Place.nameCN）写回 timeline / itinerary 条目，
 * 使 `payload.timeline` 与前端时间轴标题与 poi_cards 卡片一致（多为中文）。
 */
export function applyRouteRunPoiDisplayNamesToTimeline(
  days: Array<{ items?: ItineraryItem[] }> | undefined | null,
  cards: RouteRunPoiCard[],
): void {
  if (!days?.length || !cards?.length) return;
  const byItemId = new Map<string, RouteRunPoiCard>(
    cards.map((c) => [String(c.itinerary_item_id), c]),
  );
  for (const day of days) {
    for (const item of day.items ?? []) {
      if (item.type !== 'POI') continue;
      const card = byItemId.get(String(item.id));
      if (!card) continue;
      const title = String(card.display_name ?? '').trim();
      if (!title) continue;
      if (!item.location_ref) continue;
      item.location_ref.name = title;
    }
  }
}

type PendingPoiHydration = {
  item: ItineraryItem;
  dayIndex: number;
  date: string;
  itineraryName: string;
};

type PlaceRow = {
  id: number;
  uuid: string;
  googlePlaceId: string | null;
  nameCN: string;
  nameEN: string | null;
  category: string;
  address: string | null;
  rating: number | null;
  description: string | null;
  metadata: unknown;
  ontologyRules: unknown | null;
  lat: number | null;
  lng: number | null;
};

function parseNumericPlaceId(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * 将编排侧 `location_ref.place_id` 映射到 Place 表查询键（数字 id / uuid / Google Place Id）。
 */
export function classifyPlaceRef(raw: string | undefined | null): PlaceRefClassification | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const numeric = parseNumericPlaceId(s);
  if (numeric !== null) return { kind: 'numeric_id', id: numeric };
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  ) {
    return { kind: 'uuid', uuid: s };
  }
  // Google Places place_id：常见以 ChIJ / EhIJ 开头，或其它长字母数字串
  if (s.startsWith('ChIJ') || s.startsWith('EhIJ')) {
    return { kind: 'google_place_id', google_place_id: s };
  }
  if (s.length >= 16 && /^[A-Za-z0-9_-]+$/.test(s)) {
    return { kind: 'google_place_id', google_place_id: s };
  }
  return null;
}

function tagsFromMetadata(metadata: unknown): string[] {
  const m = metadata as { tags?: unknown } | null;
  const t = m?.tags;
  return Array.isArray(t) ? t.map((x) => String(x)).filter(Boolean) : [];
}

function isoTimeHm(d: Date | null | undefined, fallback: string): string {
  if (!d) return fallback;
  return d.toISOString().slice(11, 16);
}

const PERSISTED_TYPES_FOR_POI_CARD: ReadonlySet<string> = new Set([
  'ACTIVITY',
  'MEAL_ANCHOR',
  'MEAL_FLOATING',
  'TRANSIT',
  'REST',
]);

function persistedRowEligibleForPoiHydration(type: string): boolean {
  return PERSISTED_TYPES_FOR_POI_CARD.has(String(type));
}

/** Place / 备注 / 类型兜底文案，供 TRANSIT·REST 等仍进补水链（hydrate 内统一按 POI 处理）。 */
function persistedItemDisplayName(
  type: string,
  row: {
    note: string | null;
    Place: { nameCN: string; nameEN: string | null } | null;
  },
): string {
  const fromPlace = row.Place?.nameCN?.trim() || row.Place?.nameEN?.trim() || '';
  if (fromPlace) return fromPlace;
  const n = row.note?.trim();
  if (n) return n;
  const t = String(type);
  if (t === 'TRANSIT') return '交通（草案）';
  if (t === 'REST') return '休息（草案）';
  return '';
}

/** Prisma TripDay + ItineraryItem（含 Place）→ 编排 Itinerary；活动/餐食/交通/休息均可能进 POI 补水链。 */
export function buildItineraryFromPersistedTripDays(
  tripId: string,
  tripDays: Array<{
    date: Date;
    ItineraryItem: Array<{
      id: string;
      type: string;
      startTime: Date | null;
      endTime: Date | null;
      placeId: number | null;
      note: string | null;
      Place: { id: number; nameCN: string; nameEN: string | null } | null;
    }>;
  }>,
): Itinerary {
  const days: ItineraryDay[] = [];
  for (const day of tripDays) {
    const date = day.date.toISOString().slice(0, 10);
    const items: ItineraryItem[] = [];
    for (const row of day.ItineraryItem ?? []) {
      const t = String(row.type);
      if (!persistedRowEligibleForPoiHydration(t)) {
        continue;
      }
      const name = persistedItemDisplayName(t, row);
      if (!name && row.placeId == null) {
        continue;
      }
      items.push({
        id: row.id,
        type: 'POI',
        start_window: isoTimeHm(row.startTime, '09:00'),
        end_window: isoTimeHm(row.endTime, '11:00'),
        location_ref: {
          ...(row.placeId != null ? { place_id: String(row.placeId) } : {}),
          name: name || '地点待定',
        },
        evidence_refs: [],
        verified: false,
      });
    }
    days.push({ date, items });
  }
  return { request_id: tripId, days };
}

@Injectable()
export class RouteRunItineraryPoiHydratorService {
  private readonly logger = new Logger(RouteRunItineraryPoiHydratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 从 Trip / TripDay / ItineraryItem（库内草案）构建 Itinerary 并走与规划态相同的 Place 补水，
   * 含 ACTIVITY/餐食/TRANSIT/REST（无点名时交通、休息用草案占位文案），供咨询态仍下发 `poi_cards_by_day`。
   */
  async hydratePersistedTripDraft(tripId: string): Promise<RouteRunPoiHydrationPayload> {
    const empty: RouteRunPoiHydrationPayload = { poi_cards: [], poi_cards_by_day: [] };
    const tid = tripId.trim();
    if (!tid) return empty;
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tid },
        select: {
          id: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: {
              date: true,
              ItineraryItem: {
                orderBy: { order: 'asc' },
                select: {
                  id: true,
                  type: true,
                  startTime: true,
                  endTime: true,
                  placeId: true,
                  note: true,
                  Place: { select: { id: true, nameCN: true, nameEN: true } },
                },
              },
            },
          },
        },
      });
      if (!trip?.TripDay?.length) {
        return empty;
      }
      const itinerary = buildItineraryFromPersistedTripDays(trip.id, trip.TripDay);
      return await this.hydrateFromItinerary(itinerary);
    } catch (e: any) {
      this.logger.warn(`[RouteRunPoiHydrator] hydratePersistedTripDraft failed trip_id=${tid}: ${e?.message ?? e}`);
      return empty;
    }
  }

  async hydrateFromItinerary(itinerary: Itinerary | null | undefined): Promise<RouteRunPoiHydrationPayload> {
    const empty: RouteRunPoiHydrationPayload = { poi_cards: [], poi_cards_by_day: [] };
    if (!itinerary?.days?.length) {
      return empty;
    }

    const pending: PendingPoiHydration[] = [];
    for (let d = 0; d < itinerary.days.length; d++) {
      const day = itinerary.days[d];
      const date = day.date;
      for (const item of day.items ?? []) {
        if (item.type !== 'POI') continue;
        const itineraryName = String(item.location_ref?.name ?? '').trim() || '地点待定';
        pending.push({
          item,
          dayIndex: d + 1,
          date,
          itineraryName,
        });
      }
    }

    if (pending.length === 0) {
      return empty;
    }

    const numericIds = new Set<number>();
    const uuids = new Set<string>();
    const googleIds = new Set<string>();
    for (const p of pending) {
      const ref = classifyPlaceRef(p.item.location_ref?.place_id as string | undefined);
      if (!ref) continue;
      if (ref.kind === 'numeric_id') numericIds.add(ref.id);
      else if (ref.kind === 'uuid') uuids.add(ref.uuid);
      else if (ref.kind === 'google_place_id') googleIds.add(ref.google_place_id);
    }

    const orConds: Prisma.PlaceWhereInput[] = [];
    if (numericIds.size > 0) orConds.push({ id: { in: [...numericIds] } });
    if (uuids.size > 0) orConds.push({ uuid: { in: [...uuids] } });
    if (googleIds.size > 0) orConds.push({ googlePlaceId: { in: [...googleIds] } });

    const byId = new Map<number, PlaceRow>();
    const byUuid = new Map<string, PlaceRow>();
    const byGoogle = new Map<string, PlaceRow>();

    if (orConds.length > 0) {
      try {
        const found = await this.prisma.place.findMany({
          where: { OR: orConds },
          select: {
            id: true,
            uuid: true,
            googlePlaceId: true,
            nameCN: true,
            nameEN: true,
            category: true,
            address: true,
            rating: true,
            description: true,
            metadata: true,
            ontologyRules: true,
          },
        });

        const needCoords = found.map((r) => r.id);
        let coordMap = new Map<number, { lat: number | null; lng: number | null }>();
        if (needCoords.length > 0) {
          const withCoords = await this.prisma.$queryRaw<
            Array<{ id: number; lat: number | null; lng: number | null }>
          >`
            SELECT p.id,
              ST_Y(p.location::geometry) AS lat,
              ST_X(p.location::geometry) AS lng
            FROM "Place" p
            WHERE p.id = ANY(${needCoords}::int[])
          `;
          coordMap = new Map(withCoords.map((c) => [c.id, c]));
        }

        for (const r of found) {
          const c = coordMap.get(r.id);
          const full: PlaceRow = {
            id: r.id,
            uuid: r.uuid,
            googlePlaceId: r.googlePlaceId ?? null,
            nameCN: r.nameCN,
            nameEN: r.nameEN,
            category: String(r.category),
            address: r.address,
            rating: r.rating,
            description: r.description,
            metadata: r.metadata,
            ontologyRules: r.ontologyRules ?? null,
            lat: c?.lat ?? null,
            lng: c?.lng ?? null,
          };
          byId.set(full.id, full);
          byUuid.set(full.uuid, full);
          if (full.googlePlaceId) {
            byGoogle.set(full.googlePlaceId, full);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[RouteRunPoiHydrator] Place registry batch failed: ${e?.message ?? e}`);
      }
    }

    const stillNeedName = pending.filter((p) => {
      const hit = this.resolvePlaceRowFromRegistry(p, byId, byUuid, byGoogle);
      return !hit.row;
    });

    const nameSet = [
      ...new Set(stillNeedName.map((p) => p.itineraryName).filter((n) => n && n !== '地点待定')),
    ];

    const byNameCn = new Map<string, PlaceRow>();
    const byNameEn = new Map<string, PlaceRow>();
    if (nameSet.length > 0) {
      try {
        const rows = await this.prisma.place.findMany({
          where: {
            OR: [{ nameCN: { in: nameSet } }, { nameEN: { in: nameSet } }],
          },
          select: {
            id: true,
            uuid: true,
            googlePlaceId: true,
            nameCN: true,
            nameEN: true,
            category: true,
            address: true,
            rating: true,
            description: true,
            metadata: true,
            ontologyRules: true,
          },
        });

        const needCoords = rows.map((r) => r.id);
        let coordMap = new Map<number, { lat: number | null; lng: number | null }>();
        if (needCoords.length > 0) {
          const withCoords = await this.prisma.$queryRaw<
            Array<{ id: number; lat: number | null; lng: number | null }>
          >`
            SELECT p.id,
              ST_Y(p.location::geometry) AS lat,
              ST_X(p.location::geometry) AS lng
            FROM "Place" p
            WHERE p.id = ANY(${needCoords}::int[])
          `;
          coordMap = new Map(withCoords.map((c) => [c.id, c]));
        }

        for (const r of rows) {
          const c = coordMap.get(r.id);
          const full: PlaceRow = {
            id: r.id,
            uuid: r.uuid,
            googlePlaceId: r.googlePlaceId ?? null,
            nameCN: r.nameCN,
            nameEN: r.nameEN,
            category: String(r.category),
            address: r.address,
            rating: r.rating,
            description: r.description,
            metadata: r.metadata,
            ontologyRules: r.ontologyRules ?? null,
            lat: c?.lat ?? null,
            lng: c?.lng ?? null,
          };
          byNameCn.set(r.nameCN, full);
          if (r.nameEN) {
            byNameEn.set(r.nameEN, full);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[RouteRunPoiHydrator] name lookup failed: ${e?.message ?? e}`);
      }
    }

    const cards: RouteRunPoiCard[] = [];

    for (const p of pending) {
      let row: PlaceRow | undefined;
      let matched: RouteRunPoiCardMatchedFrom = 'itinerary_only';

      const reg = this.resolvePlaceRowFromRegistry(p, byId, byUuid, byGoogle);
      if (reg.row) {
        row = reg.row;
        matched = reg.matched;
      }
      if (!row && p.itineraryName && p.itineraryName !== '地点待定') {
        row = byNameCn.get(p.itineraryName) ?? byNameEn.get(p.itineraryName);
        if (row) matched = 'name_exact';
      }

      const resolved = Boolean(row);
      const displayName = row
        ? row.nameCN || row.nameEN || p.itineraryName || '地点待定'
        : p.itineraryName || '地点待定';

      cards.push({
        place_id: row?.id ?? parseNumericPlaceId(p.item.location_ref?.place_id as string | undefined),
        uuid: row?.uuid ?? null,
        itinerary_item_id: p.item.id,
        day_index: p.dayIndex,
        date: p.date,
        item_type: p.item.type,
        start_window: p.item.start_window,
        end_window: p.item.end_window,
        itinerary_name: p.itineraryName,
        name_cn: row?.nameCN ?? null,
        name_en: row?.nameEN ?? null,
        display_name: displayName,
        category: row?.category ?? null,
        rating: row?.rating ?? null,
        description: row?.description ?? null,
        address: row?.address ?? null,
        lat: row?.lat ?? p.item.location_ref?.coordinates?.lat ?? null,
        lng: row?.lng ?? p.item.location_ref?.coordinates?.lng ?? null,
        tags: row ? tagsFromMetadata(row.metadata) : [],
        matched_from: matched,
        ontologyRules: row?.ontologyRules ?? null,
        resolved_from_place_registry: resolved,
      });
    }

    const byDayMap = new Map<number, RouteRunPoiCard[]>();
    for (const c of cards) {
      const list = byDayMap.get(c.day_index) ?? [];
      list.push(c);
      byDayMap.set(c.day_index, list);
    }

    const poi_cards_by_day = itinerary.days.map((day, idx) => ({
      day_index: idx + 1,
      date: day.date,
      cards: byDayMap.get(idx + 1) ?? [],
    }));

    return { poi_cards: cards, poi_cards_by_day };
  }

  private resolvePlaceRowFromRegistry(
    p: PendingPoiHydration,
    byId: Map<number, PlaceRow>,
    byUuid: Map<string, PlaceRow>,
    byGoogle: Map<string, PlaceRow>,
  ): { row?: PlaceRow; matched: RouteRunPoiCardMatchedFrom } {
    const rawPid = p.item.location_ref?.place_id;
    const ref = classifyPlaceRef(rawPid as string | undefined);
    if (ref?.kind === 'numeric_id') {
      const row = byId.get(ref.id);
      if (row) return { row, matched: 'place_id' };
    }
    if (ref?.kind === 'uuid') {
      const row = byUuid.get(ref.uuid);
      if (row) return { row, matched: 'place_uuid' };
    }
    if (ref?.kind === 'google_place_id') {
      const row = byGoogle.get(ref.google_place_id);
      if (row) return { row, matched: 'place_google_id' };
    }
    return { matched: 'itinerary_only' };
  }
}
