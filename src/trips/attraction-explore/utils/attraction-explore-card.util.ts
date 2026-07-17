import type { Place } from '@prisma/client';
import { estimateDrivingLeg } from './attraction-explore-route-detour.util';
import {
  extractPlaceMeta,
  isIndoorFriendlyPlace,
  isRainyDayFriendlyPlace,
  matchesSuitability,
  resolvePlaceCoordsOrNull,
} from './attraction-explore-place.util';
import type {
  AttractionExploreOpenStatus,
  AttractionExplorePrimaryAction,
  AttractionExploreQuickFilterId,
  AttractionExploreRecommendationItem,
  AttractionExploreSortId,
} from '../types/attraction-explore.types';

type PlaceWithCity = Place & { City?: { name?: string | null } | null };

function readMetadata(place: Place): Record<string, unknown> {
  return (place.metadata as Record<string, unknown> | null) ?? {};
}

/** 「驾车 12 分钟 · 距离 8.6 km」 */
export function formatTravelInfo(driveMinutes?: number, distanceKm?: number): string | undefined {
  const parts: string[] = [];
  if (driveMinutes != null && Number.isFinite(driveMinutes)) {
    parts.push(`驾车 ${Math.max(1, Math.round(driveMinutes))} 分钟`);
  }
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    const km = distanceKm < 10 ? distanceKm.toFixed(1) : String(Math.round(distanceKm));
    parts.push(`距离 ${km} km`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

export function resolveOpenStatus(place: Place, now = new Date()): AttractionExploreOpenStatus {
  const metadata = readMetadata(place);
  const hours = metadata.openingHours ?? metadata.openHours ?? metadata.hours;
  if (!hours || typeof hours !== 'object') return 'unknown';

  const row = hours as Record<string, unknown>;
  if (row.isOpen === true || row.openNow === true) return 'open';
  if (row.isOpen === false || row.openNow === false) return 'closed';

  const periods = Array.isArray(row.periods) ? row.periods : null;
  if (!periods?.length) return 'unknown';

  const day = now.getDay(); // 0=Sun
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const period of periods) {
    if (!period || typeof period !== 'object') continue;
    const p = period as { open?: { day?: number; time?: string }; close?: { day?: number; time?: string } };
    if (p.open?.day !== day || typeof p.open.time !== 'string') continue;
    const openMin = parseHm(p.open.time);
    const closeMin =
      typeof p.close?.time === 'string' ? parseHm(p.close.time) : openMin + 8 * 60;
    if (openMin == null || closeMin == null) continue;
    if (minutes >= openMin && minutes < closeMin) return 'open';
    return 'closed';
  }
  return 'unknown';
}

function parseHm(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

export function estimateTravelFromOrigin(
  place: Place,
  origin: { lat: number; lng: number } | null | undefined,
  countryCode?: string,
): { driveMinutes?: number; distanceKm?: number; travelInfo?: string } {
  if (!origin) return {};
  const coords = resolvePlaceCoordsOrNull(place);
  if (!coords) return {};
  const leg = estimateDrivingLeg(origin, coords, { countryCode });
  const driveMinutes = Math.max(1, Math.round(leg.durationMinutes));
  const distanceKm = Math.round(leg.distanceKm * 10) / 10;
  return {
    driveMinutes,
    distanceKm,
    travelInfo: formatTravelInfo(driveMinutes, distanceKm),
  };
}

export function buildRecommendationTags(input: {
  place: Place;
  weatherHint?: string | null;
  alreadyInDay?: boolean;
  alreadyInItinerary?: boolean;
  reasons?: string[];
}): string[] {
  const tags: string[] = [];
  const { place, weatherHint, alreadyInDay, alreadyInItinerary, reasons } = input;
  if (alreadyInDay) tags.push('已在当日');
  else if (alreadyInItinerary) tags.push('已在行程');

  if (isIndoorFriendlyPlace(place) || isRainyDayFriendlyPlace(place)) {
    if (weatherHint && /wind|风|gale|storm|雨|rain/i.test(weatherHint)) {
      tags.push('适合风大天气');
    } else {
      tags.push('室内友好');
    }
  }

  const physical = extractPlaceMeta(place).physicalLevel;
  if (physical === 'LOW') tags.push('轻松好走');
  if (physical === 'HIGH') tags.push('体力要求较高');

  if (reasons?.some((r) => /不影响|空档|缓冲/i.test(r))) {
    tags.push('不影响后续行程');
  } else if (!alreadyInDay && !alreadyInItinerary) {
    tags.push('不影响后续行程');
  }

  return [...new Set(tags)].slice(0, 4);
}

export function resolvePrimaryAction(alreadyInDay?: boolean): AttractionExplorePrimaryAction {
  return alreadyInDay ? 'add' : 'add_to_day';
}

export function buildContextTip(weatherHint?: string | null): string | undefined {
  if (!weatherHint?.trim()) return undefined;
  const hint = weatherHint.trim();
  if (/wind|风|gale|storm/i.test(hint)) {
    return `当前有强风提示（${hint}），优先室内或短途点`;
  }
  if (/rain|雨|shower/i.test(hint)) {
    return `今日有雨（${hint}），已优先室内备选`;
  }
  return hint;
}

export function matchesQuickFilter(
  place: Place,
  filterId: AttractionExploreQuickFilterId | string,
  opts?: {
    origin?: { lat: number; lng: number } | null;
    countryCode?: string;
    suitabilityIds?: string[];
    nearbyKm?: number;
  },
): boolean {
  switch (filterId) {
    case 'nearby': {
      const travel = estimateTravelFromOrigin(place, opts?.origin, opts?.countryCode);
      if (travel.distanceKm == null) return true;
      return travel.distanceKm <= (opts?.nearbyKm ?? 40);
    }
    case 'indoor':
      return isIndoorFriendlyPlace(place) || isRainyDayFriendlyPlace(place);
    case 'supply': {
      const hay = `${place.nameCN} ${place.nameEN ?? ''} ${JSON.stringify(readMetadata(place))}`.toLowerCase();
      return /补给|超市|grocery|market|加油站|gas|petrol|n1|便利店|convenience|pharmacy|药店|atm/i.test(
        hay,
      );
    }
    case 'easy': {
      const physical = extractPlaceMeta(place).physicalLevel;
      return physical !== 'HIGH';
    }
    case 'team': {
      const suits = opts?.suitabilityIds ?? [];
      if (!suits.length) return true;
      return suits.some((s) => matchesSuitability(place, s));
    }
    default:
      return true;
  }
}

export function sortRecommendationItems(
  items: AttractionExploreRecommendationItem[],
  sort: AttractionExploreSortId | string | undefined,
): AttractionExploreRecommendationItem[] {
  const next = [...items];
  switch (sort) {
    case 'distance':
      return next.sort(
        (a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY),
      );
    case 'match':
      return next.sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0));
    case 'open_now':
      return next.sort((a, b) => openRank(a.openStatus) - openRank(b.openStatus));
    case 'smart':
    default:
      return next.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}

function openRank(status?: AttractionExploreOpenStatus): number {
  if (status === 'open') return 0;
  if (status === 'unknown') return 1;
  return 2;
}

/** 为卡片补齐 iOS 设计稿字段（title / travelInfo / tags / …），保留 name 等旧字段 */
export function enrichRecommendationCard(
  item: AttractionExploreRecommendationItem,
  place: PlaceWithCity,
  opts?: {
    origin?: { lat: number; lng: number } | null;
    countryCode?: string;
    weatherHint?: string | null;
    isAiRecommended?: boolean;
  },
): AttractionExploreRecommendationItem {
  const travel = estimateTravelFromOrigin(place, opts?.origin, opts?.countryCode);
  const openStatus = resolveOpenStatus(place);
  const matchPercent =
    item.matchPercent ??
    (typeof item.score === 'number' ? Math.round(Math.min(1, Math.max(0, item.score)) * 100) : undefined);
  const tags = buildRecommendationTags({
    place,
    weatherHint: opts?.weatherHint,
    alreadyInDay: item.alreadyInDay,
    alreadyInItinerary: item.alreadyInItinerary,
    reasons: item.recommendationReasons,
  });

  let badge = item.badge ?? null;
  if (!badge && opts?.isAiRecommended) badge = 'AI 推荐';
  if (!badge && openStatus === 'open') badge = '开放中';
  if (!badge && item.alreadyInDay) badge = '已在当日';

  return {
    ...item,
    title: item.title ?? item.name,
    summary: item.summary ?? item.description ?? undefined,
    isAiRecommended: opts?.isAiRecommended === true ? true : item.isAiRecommended,
    openStatus,
    driveMinutes: item.driveMinutes ?? travel.driveMinutes,
    distanceKm: item.distanceKm ?? travel.distanceKm,
    travelInfo: item.travelInfo ?? travel.travelInfo,
    tags: item.tags?.length ? item.tags : tags,
    matchPercent,
    primaryAction: item.primaryAction ?? resolvePrimaryAction(item.alreadyInDay),
    badge,
  };
}

export function flattenUniqueRecommendationItems(
  groups: Array<{ items: AttractionExploreRecommendationItem[] }>,
): AttractionExploreRecommendationItem[] {
  const seen = new Set<number>();
  const out: AttractionExploreRecommendationItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      const key = item.placeId ?? (typeof item.id === 'number' ? item.id : Number(item.id));
      if (!Number.isFinite(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
