import type { Place } from '@prisma/client';
import {
  extractPlaceMeta,
  isCoreAttraction,
  isRainyDayFriendlyPlace,
  matchesSuitability,
  matchesTheme,
  resolvePlaceCoordsOrNull,
} from './attraction-explore-place.util';
import {
  classifyPlaceExperience,
  experienceGapScore,
  type ExperienceCoverageSnapshot,
} from './attraction-explore-experience-coverage.util';
import { estimatePlaceDetourToRoute } from './attraction-explore-route-detour.util';

export interface AttractionExploreScoringContext {
  themeIds?: string[];
  suitabilityIds?: string[];
  routePlaceIds: Set<number>;
  scheduledPlaceIds: Set<number>;
  routeAnchors: Array<{ lat: number; lng: number }>;
  experienceCoverage: ExperienceCoverageSnapshot;
  weatherHint?: string | null;
  countryCode?: string;
  maxDetourMinutes?: number;
}

export interface AttractionExploreScoredPlace {
  place: Place;
  score: number;
  reasons: string[];
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interestMatch(place: Place, themeIds?: string[]): number {
  if (!themeIds?.length) return isCoreAttraction(place) ? 0.8 : 0.5;
  const hits = themeIds.filter((t) => matchesTheme(place, t)).length;
  return Math.min(1, hits / Math.max(1, themeIds.length) + (isCoreAttraction(place) ? 0.2 : 0));
}

function memberFit(place: Place, suitabilityIds?: string[]): number {
  if (!suitabilityIds?.length) return 0.6;
  const hits = suitabilityIds.filter((s) => matchesSuitability(place, s)).length;
  return Math.min(1, hits / suitabilityIds.length);
}

function routeMatch(
  place: Place,
  routePlaceIds: Set<number>,
  anchors: Array<{ lat: number; lng: number }>,
  countryCode?: string,
): number {
  if (routePlaceIds.has(place.id)) return 1;
  const coords = resolvePlaceCoordsOrNull(place);
  if (!coords || anchors.length === 0) return 0.2;

  const detour = estimatePlaceDetourToRoute({
    place: coords,
    routeAnchors: anchors,
    countryCode,
  });
  if (!detour) return 0.15;
  if (detour.detourMinutes <= 15) return 0.95;
  if (detour.detourMinutes <= 30) return 0.8;
  if (detour.detourMinutes <= 45) return 0.55;
  if (detour.detourMinutes <= 60) return 0.35;
  return 0.15;
}

function insertability(scheduledPlaceIds: Set<number>, place: Place): number {
  return scheduledPlaceIds.has(place.id) ? 0.1 : 0.75;
}

function scarcity(place: Place, scheduledPlaceIds: Set<number>): number {
  const category = classifyPlaceExperience(place);
  const scheduledCategories = new Set<ReturnType<typeof classifyPlaceExperience>>();
  void scheduledCategories;
  if (scheduledPlaceIds.has(place.id)) return 0;
  if (category === 'culture_history' || category === 'urban_culture') return 0.85;
  if (category === 'food_experience' || category === 'hot_springs') return 0.7;
  return 0.45;
}

function weatherFit(place: Place, weatherHint?: string | null): number {
  if (!weatherHint || !/rain|雨/i.test(weatherHint)) return 0.5;
  return isRainyDayFriendlyPlace(place) ? 0.95 : 0.2;
}

function popularity(place: Place): number {
  const rating = typeof place.rating === 'number' ? place.rating : 0;
  return Math.min(1, rating / 5);
}

export function scoreAttractionExplorePlace(
  place: Place,
  ctx: AttractionExploreScoringContext,
): AttractionExploreScoredPlace {
  const gapBoost = experienceGapScore(place, ctx.experienceCoverage.gaps) / 100;
  const reasons: string[] = [];
  const base =
    interestMatch(place, ctx.themeIds) * 0.25 +
    routeMatch(place, ctx.routePlaceIds, ctx.routeAnchors, ctx.countryCode) * 0.2 +
    memberFit(place, ctx.suitabilityIds) * 0.15 +
    insertability(ctx.scheduledPlaceIds, place) * 0.15 +
    scarcity(place, ctx.scheduledPlaceIds) * 0.1 +
    weatherFit(place, ctx.weatherHint) * 0.1 +
    popularity(place) * 0.05;

  const score = Math.min(1, base + gapBoost);
  const coords = resolvePlaceCoordsOrNull(place);
  const detour =
    coords && ctx.routeAnchors.length > 0
      ? estimatePlaceDetourToRoute({
          place: coords,
          routeAnchors: ctx.routeAnchors,
          countryCode: ctx.countryCode,
        })
      : null;
  if (ctx.maxDetourMinutes != null && detour && detour.detourMinutes > ctx.maxDetourMinutes) {
    return { place, score: score * 0.3, reasons: [...reasons, '超出绕路容忍范围'] };
  }
  if (isCoreAttraction(place)) reasons.push('首次旅行代表性');
  if (ctx.routePlaceIds.has(place.id)) reasons.push('已在路线中');
  if (gapBoost > 0) reasons.push('补足行程体验结构');
  const meta = extractPlaceMeta(place);
  if (meta.physicalLevel === 'LOW') reasons.push('低强度友好');

  return { place, score, reasons };
}

export function rankAttractionExplorePlaces(
  places: Place[],
  ctx: AttractionExploreScoringContext,
  limit = 8,
): AttractionExploreScoredPlace[] {
  return places
    .map((place) => scoreAttractionExplorePlace(place, ctx))
    .filter((row) => row.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function estimateDetourMinutes(
  place: Place,
  anchors: Array<{ lat: number; lng: number }>,
  countryCode?: string,
): number | null {
  const coords = resolvePlaceCoordsOrNull(place);
  if (!coords || anchors.length === 0) return null;
  const detour = estimatePlaceDetourToRoute({
    place: coords,
    routeAnchors: anchors,
    countryCode,
  });
  return detour?.detourMinutes ?? null;
}
