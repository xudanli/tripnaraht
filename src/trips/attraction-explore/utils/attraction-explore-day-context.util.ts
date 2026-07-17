import type { Place } from '@prisma/client';
import { resolvePlaceCoordsOrNull } from './attraction-explore-place.util';

export type DayRecommendationContext = {
  /** 1-based */
  dayIndex: number;
  theme?: string | null;
  label?: string | null;
  placeIds: Set<number>;
  /** Normalized titles already on this day */
  titleKeys: Set<string>;
  rawTitles: string[];
  cityNames: string[];
  anchors: Array<{ lat: number; lng: number }>;
};

export function normalizeAttractionTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s·・\-_/|（）()【】\[\]「」"'`]+/g, '')
    .trim();
}

export function titlesOverlap(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAttractionTitle(a);
  const nb = normalizeAttractionTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

export function placeDisplayTitles(place: {
  nameCN?: string | null;
  nameEN?: string | null;
}): string[] {
  return [place.nameCN, place.nameEN].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
}

/** True if place is already on the focus day (id or title/location name). */
export function isPlaceAlreadyOnDay(
  place: { id: number; nameCN?: string | null; nameEN?: string | null },
  day: DayRecommendationContext,
): boolean {
  if (day.placeIds.has(place.id)) return true;
  const titles = placeDisplayTitles(place);
  for (const title of titles) {
    if (day.titleKeys.has(normalizeAttractionTitle(title))) return true;
    for (const raw of day.rawTitles) {
      if (titlesOverlap(title, raw)) return true;
    }
  }
  return false;
}

export function extractDayKeywords(day: DayRecommendationContext): string[] {
  const raw = [day.theme, day.label, ...day.rawTitles, ...day.cityNames]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ');
  const parts = raw
    .split(/[\s,，、/|·・\-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  return [...new Set(parts)].slice(0, 16);
}

/** 0–1: how well place matches day theme / titles / nearby day anchors. */
export function dayContextFitScore(
  place: Place,
  day: DayRecommendationContext | undefined,
  countryCode?: string,
): { score: number; reasons: string[] } {
  void countryCode;
  if (!day) return { score: 0.5, reasons: [] };
  const reasons: string[] = [];
  let score = 0.15;

  const haystack = [
    place.nameCN,
    place.nameEN,
    place.description,
    typeof (place.metadata as { region?: string } | null)?.region === 'string'
      ? (place.metadata as { region: string }).region
      : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const keywords = extractDayKeywords(day);
  let keywordHits = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) keywordHits += 1;
  }
  if (keywordHits > 0) {
    score += Math.min(0.45, 0.15 * keywordHits);
    reasons.push(`贴合当日「${day.theme || day.label || `Day ${day.dayIndex}`}」`);
  }

  const coords = resolvePlaceCoordsOrNull(place);
  if (coords && day.anchors.length > 0) {
    let minKm = Number.POSITIVE_INFINITY;
    for (const a of day.anchors) {
      const km = haversineKm(coords.lat, coords.lng, a.lat, a.lng);
      if (km < minKm) minKm = km;
    }
    if (minKm <= 15) {
      score += 0.4;
      reasons.push('靠近当日行程点');
    } else if (minKm <= 35) {
      score += 0.25;
      reasons.push('邻近当日活动区域');
    } else if (minKm <= 60) {
      score += 0.1;
    } else {
      score *= 0.45;
      reasons.push('距当日行程较远');
    }
  }

  return { score: Math.min(1, score), reasons };
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
