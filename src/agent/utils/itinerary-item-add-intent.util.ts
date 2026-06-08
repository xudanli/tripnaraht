/**
 * 绑定 Trip「新增 POI」时的意图型检索：根据用户描述（如「购买水果」）在指定天景点附近找 POI。
 */

import type { TripDayLikeForDelete, TripItemLikeForDelete, TripLikeForDelete } from './itinerary-item-delete.util';

export interface PoiIntentProfile {
  /** 语义检索 query */
  semanticQuery: string;
  /** geo.findNearbyPOI 类别 */
  geoCategories: Array<'RESTAURANT' | 'ATTRACTION' | 'SHOPPING' | 'HOTEL' | 'NATURE' | 'VIEWPOINT' | 'HISTORIC_SITE'>;
  /** 匹配 Place.category 或 metadata.canonicalType */
  placeCategories: string[];
  /** 用户可读意图标签 */
  intentLabel: string;
}

export interface IntentPoiCandidate {
  id?: number;
  nameCN?: string | null;
  nameEN?: string | null;
  category?: string | null;
  distanceMeters?: number;
}

function tripDays(trip: TripLikeForDelete): TripDayLikeForDelete[] {
  if (Array.isArray(trip.days) && trip.days.length) return trip.days;
  return trip.TripDay ?? [];
}

function dayItems(day: TripDayLikeForDelete): TripItemLikeForDelete[] {
  if (Array.isArray(day.items) && day.items.length) return day.items;
  return day.ItineraryItem ?? [];
}

function extractPlaceCoords(place: {
  location?: { lat?: number; lng?: number } | null;
  metadata?: { lat?: number; lng?: number; coordinates?: { lat?: number; lng?: number } | [number, number] } | null;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}): { lat: number; lng: number } | null {
  const loc = place.location;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return { lat: Number(loc.lat), lng: Number(loc.lng) };
  }
  if (Number.isFinite(place.lat) && Number.isFinite(place.lng)) {
    return { lat: Number(place.lat), lng: Number(place.lng) };
  }
  if (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)) {
    return { lat: Number(place.latitude), lng: Number(place.longitude) };
  }
  const meta = place.metadata;
  if (meta?.lat != null && meta?.lng != null) {
    return { lat: Number(meta.lat), lng: Number(meta.lng) };
  }
  const coords = meta?.coordinates;
  if (coords && typeof coords === 'object' && !Array.isArray(coords)) {
    const c = coords as { lat?: number; lng?: number };
    if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
      return { lat: Number(c.lat), lng: Number(c.lng) };
    }
  }
  if (Array.isArray(coords) && coords.length >= 2) {
    const a = Number(coords[0]);
    const b = Number(coords[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
      return { lat: b, lng: a };
    }
  }
  return null;
}

/** 用户描述的是意图（如「购买水果」）而非具体 POI 名称 */
export function isIntentBasedPoiQuery(poiQuery: string): boolean {
  const q = String(poiQuery ?? '').trim();
  if (!q) return false;
  if (
    /购买|采购|补给|购物|超市|便利店|加油|用餐|吃饭|午餐|晚餐|休息站|上厕所|厕所|买.*(?:食物|菜|水果|东西)|grocery|supermarket|fuel|gas\s*station|convenience/i.test(
      q,
    )
  ) {
    return true;
  }
  if (/^(?:一个|一家|一处|有个|找(?:个|家|处)?|可以|能)/.test(q)) return true;
  return false;
}

/** 将意图描述映射为检索 profile */
export function resolvePoiIntentProfile(poiQuery: string): PoiIntentProfile | null {
  const q = String(poiQuery ?? '').trim();
  if (!q) return null;

  if (/水果|超市|便利店|购买|买.*(?:食物|菜|水果|东西)|grocery|supermarket|购物/i.test(q)) {
    return {
      semanticQuery: '超市 supermarket grocery 购买水果',
      geoCategories: ['SHOPPING'],
      placeCategories: ['SHOPPING', 'SUPERMARKET', 'CONVENIENCE_STORE'],
      intentLabel: '超市/购物点',
    };
  }
  if (/加油|加油站|fuel|gas\s*station/i.test(q)) {
    return {
      semanticQuery: '加油站 gas station fuel',
      geoCategories: [],
      placeCategories: ['GAS_STATION', 'FUEL_STATION'],
      intentLabel: '加油站',
    };
  }
  if (/餐厅|吃饭|用餐|午餐|晚餐|restaurant|dining/i.test(q)) {
    return {
      semanticQuery: '餐厅 restaurant 用餐',
      geoCategories: ['RESTAURANT'],
      placeCategories: ['RESTAURANT', 'CAFE'],
      intentLabel: '餐厅',
    };
  }
  if (/休息|休息站|rest\s*area|rest\s*stop/i.test(q)) {
    return {
      semanticQuery: '休息站 rest area',
      geoCategories: ['VIEWPOINT'],
      placeCategories: ['REST_AREA', 'VIEWPOINT', 'TOILETS'],
      intentLabel: '休息点',
    };
  }

  if (isIntentBasedPoiQuery(q)) {
    return {
      semanticQuery: q.replace(/^(?:一个|一家|一处|可以|能|用来|用于)\s*/u, '').trim() || q,
      geoCategories: ['SHOPPING', 'RESTAURANT'],
      placeCategories: [],
      intentLabel: '相关地点',
    };
  }
  return null;
}

/** 从指定天的行程项中提取搜索锚点（优先景点，其次其他非酒店 POI） */
export function extractDaySearchAnchor(
  trip: TripLikeForDelete,
  dayNumber: number,
): { lat: number; lng: number } | null {
  const days = tripDays(trip);
  const idx = dayNumber - 1;
  if (idx < 0 || idx >= days.length) return null;

  const scored: Array<{ lat: number; lng: number; score: number }> = [];
  for (const item of dayItems(days[idx])) {
    const place = item.Place ?? item.place;
    if (!place) continue;
    const coords = extractPlaceCoords(place as Parameters<typeof extractPlaceCoords>[0]);
    if (!coords) continue;
    let score = 1;
    const cat = String((place as { category?: string }).category ?? '').toUpperCase();
    if (/ATTRACTION|NATURE|VIEWPOINT|SCENIC|PARK|MUSEUM/.test(cat)) score += 4;
    else if (/RESTAURANT|CAFE|SHOPPING/.test(cat)) score += 2;
    else if (/HOTEL|ACCOMMODATION/.test(cat)) score -= 1;
    scored.push({ ...coords, score });
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return { lat: scored[0].lat, lng: scored[0].lng };
}

function categoryMatchesIntent(
  category: string | null | undefined,
  profile: PoiIntentProfile,
): boolean {
  if (!profile.placeCategories.length) return true;
  const cat = String(category ?? '').toUpperCase();
  if (profile.placeCategories.some((c) => cat.includes(c))) return true;
  return false;
}

function placeIdsOnDay(trip: TripLikeForDelete, dayNumber: number): Set<number> {
  const ids = new Set<number>();
  const days = tripDays(trip);
  const idx = dayNumber - 1;
  if (idx < 0 || idx >= days.length) return ids;
  for (const item of dayItems(days[idx])) {
    const place = item.Place ?? item.place;
    if (place?.id != null) ids.add(place.id);
  }
  return ids;
}

/** 该天是否已有满足意图的 POI（按类别判断，非名称匹配） */
export function intentAlreadySatisfiedOnDay(
  trip: TripLikeForDelete,
  dayNumber: number,
  profile: PoiIntentProfile,
): boolean {
  if (!profile.placeCategories.length) return false;
  const days = tripDays(trip);
  const idx = dayNumber - 1;
  if (idx < 0 || idx >= days.length) return false;
  return dayItems(days[idx]).some((item) => {
    const place = item.Place ?? item.place;
    if (!place) return false;
    const cat = String((place as { category?: string }).category ?? '');
    const meta = (place as { metadata?: { canonicalType?: string } }).metadata;
    const canonical = String(meta?.canonicalType ?? '');
    return (
      categoryMatchesIntent(cat, profile) ||
      profile.placeCategories.some((c) => canonical.toUpperCase().includes(c))
    );
  });
}

/** 从语义/附近检索候选中选出最佳 placeId */
export function resolvePlaceIdForIntentAdd(
  trip: TripLikeForDelete,
  dayNumber: number,
  candidates: IntentPoiCandidate[],
  profile: PoiIntentProfile,
): number | undefined {
  const onDay = placeIdsOnDay(trip, dayNumber);
  const scored: Array<{ id: number; score: number }> = [];

  for (const c of candidates) {
    if (c.id == null || !Number.isFinite(c.id) || onDay.has(c.id)) continue;
    let score = 1;
    if (categoryMatchesIntent(c.category, profile)) score += 5;
    const name = [c.nameCN, c.nameEN].filter(Boolean).join(' ');
    if (/bonus|bónus|kronan|krónan|hagkaup|supermarket|超市/i.test(name)) score += 3;
    if (typeof c.distanceMeters === 'number' && Number.isFinite(c.distanceMeters)) {
      score += Math.max(0, 4 - c.distanceMeters / 15000);
    }
    scored.push({ id: c.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

export function buildIntentAddNotFoundAnswer(dayNumber: number | undefined, profile: PoiIntentProfile): string {
  const dayPart = dayNumber ? `第${dayNumber}天` : '该天';
  return `未在${dayPart}景点附近找到合适的${profile.intentLabel}，请尝试指定具体名称（如 Krónan、Bónus）。`;
}

export function buildIntentAddAlreadyExistsAnswer(dayNumber: number | undefined, profile: PoiIntentProfile): string {
  const dayPart = dayNumber ? `第${dayNumber}天` : '行程中';
  return `${dayPart}已有${profile.intentLabel}，无需重复添加。`;
}
