import { collectPlaceImages } from '../../trips/utils/cover-image.util';

export function resolveActivityImageUrl(placeMetadata: unknown): string | null {
  const urls = collectPlaceImages(placeMetadata);
  return urls[0] ?? null;
}

export function formatDistanceKmChinese(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

export function formatRoadNumber(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^F\d+/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+$/.test(trimmed)) return `${trimmed}号公路`;
  const routeMatch = trimmed.match(/route\s*(\d+)/i);
  if (routeMatch?.[1]) return `${routeMatch[1]}号公路`;
  if (trimmed.includes('号公路')) return trimmed;
  return trimmed;
}

export function matchRoadLabelFromText(text: string): string | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const explicit = normalized.match(
    /(\d{1,4}号公路|Route\s*\d+|F\d{2,4}|R\d{1,4}|一号公路|Ring\s*Road)/i,
  );
  if (explicit?.[1]) return formatRoadNumber(explicit[1]);

  if (/公路/.test(normalized)) {
    const segment = normalized.split(/[，,;；]/)[0]?.trim();
    return segment && segment.length <= 40 ? segment : null;
  }

  return null;
}

export function extractRoadSegmentLabel(input: {
  note?: string | null;
  placeName?: string | null;
  placeMetadata?: Record<string, unknown> | null;
  travelMode?: string | null;
  itemType?: string | null;
}): string | null {
  const isTransitLike =
    input.itemType === 'TRANSIT' ||
    (input.travelMode ?? '').toUpperCase() === 'DRIVE' ||
    (input.travelMode ?? '').toUpperCase() === 'TRANSIT';

  const fromNote = input.note ? matchRoadLabelFromText(input.note) : null;
  if (fromNote) return fromNote;

  const meta = input.placeMetadata ?? {};
  for (const key of ['roadNumber', 'road_number', 'highwayNumber', 'highway']) {
    const value = meta[key];
    if (typeof value === 'string' || typeof value === 'number') {
      return formatRoadNumber(String(value));
    }
  }

  for (const key of ['roadName', 'road_name', 'segmentLabel', 'routeLabel']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const fromPlaceName = input.placeName ? matchRoadLabelFromText(input.placeName) : null;
  if (fromPlaceName) return fromPlaceName;

  if (isTransitLike && input.placeName?.trim()) {
    return input.placeName.trim();
  }

  return null;
}

export function resolveDestinationShortLabel(input: {
  placeName?: string | null;
  placeCategory?: string | null;
}): string {
  const name = (input.placeName ?? '').trim();
  if (!name) return '下一站';
  if (/营地|camp|campsite/i.test(name)) return '营地';
  if ((input.placeCategory ?? '').toUpperCase() === 'HOTEL') return '营地';
  return name.length > 12 ? `${name.slice(0, 12)}…` : name;
}

export function buildCurrentLocationName(input: {
  roadLabel?: string | null;
  destinationLabel?: string | null;
  distanceMeters?: number | null;
}): string | null {
  const parts: string[] = [];
  const road = input.roadLabel?.trim();
  const dest = input.destinationLabel?.trim();
  const distanceMeters = input.distanceMeters;

  if (road) parts.push(road);

  if (dest && distanceMeters != null && distanceMeters > 0) {
    parts.push(`距${dest} ${formatDistanceKmChinese(distanceMeters)}`);
  } else if (dest && !road) {
    parts.push(`前往${dest}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}
