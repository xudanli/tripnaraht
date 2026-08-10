/**
 * Map Place/OSM opening_hours → lodging openingMode.
 * Never parses into clock hours for Situation — only mode bands.
 */

import type {
  LodgingHoursInput,
  LodgingOpeningMode,
} from './iceland-winter-knowledge.types';

const SEASONAL_RE =
  /\b(seasonal|winter\s*only|summer\s*only|off[\s-]?season|reduced\s*hours|closed\s*in\s*winter)\b/i;

/**
 * Conservative mapper:
 * - empty / missing → UNKNOWN
 * - seasonal / reduced keywords → SEASONAL_REDUCED
 * - any other non-empty schedule string → KNOWN (do not invent HH:mm)
 */
export function mapOsmOpeningHoursToLodgingOpeningMode(
  raw?: string | null,
): LodgingOpeningMode {
  if (raw == null) return 'UNKNOWN';
  const s = String(raw).trim();
  if (!s) return 'UNKNOWN';
  if (SEASONAL_RE.test(s)) return 'SEASONAL_REDUCED';
  return 'KNOWN';
}

export function extractOpeningHoursFromPlaceMetadata(
  metadata: unknown,
): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const meta = metadata as Record<string, unknown>;
  const raw =
    meta.openingHours ??
    meta.opening_hours ??
    (meta.osmTags && typeof meta.osmTags === 'object'
      ? (meta.osmTags as Record<string, unknown>).opening_hours
      : undefined);
  if (raw == null) return undefined;
  const s = String(raw).trim();
  return s || undefined;
}

export function lodgingHoursFromOpeningRaw(input: {
  openingHours?: string | null;
  /** Policy / booking check-in latest — never invent from empty Place hours */
  latestArrivalLocalMin?: number;
  /** Explicit hotel slot without Place hours → force UNKNOWN */
  forceUnknown?: boolean;
}): LodgingHoursInput {
  if (input.forceUnknown) {
    return {
      openingMode: 'UNKNOWN',
      hoursUnknown: true,
      latestArrivalLocalMin: input.latestArrivalLocalMin,
    };
  }
  const openingMode = mapOsmOpeningHoursToLodgingOpeningMode(input.openingHours);
  return {
    openingMode,
    hoursUnknown: openingMode === 'UNKNOWN',
    latestArrivalLocalMin: input.latestArrivalLocalMin,
  };
}

/** Hotel Place row → lodging input; blank OH → UNKNOWN (hoursUnknown). */
export function lodgingHoursFromHotelPlace(input: {
  metadata?: unknown;
  latestArrivalLocalMin?: number;
}): LodgingHoursInput {
  const oh = extractOpeningHoursFromPlaceMetadata(input.metadata);
  return lodgingHoursFromOpeningRaw({
    openingHours: oh,
    forceUnknown: !oh,
    latestArrivalLocalMin: input.latestArrivalLocalMin,
  });
}
