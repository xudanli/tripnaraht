import type { Itinerary } from '../interfaces/trip-plan.interface';

/** Minutes of slack below which a hard-booking node is considered fragile (UI + effort penalty). */
export const FRAGILE_BUFFER_MINUTES = 10;

/** At or below this remaining slack (minutes) ⇒ HIGH risk tier (inclusive). */
export const HIGH_RISK_BUFFER_MINUTES = 5;

/** Need at least this many hard-booking nodes in the fragile band to force HIGH when min buffer is borderline. */
export const HIGH_RISK_MULTI_FRAGILE_MIN_COUNT = 2;

export type TimelineFragilityAssessment = {
  /** Smallest non-negative buffer (minutes) observed at any hard booking after rolling postpone; null if none. */
  min_buffer_minutes: number | null;
  /** Hard bookings with 0 <= buffer < FRAGILE_BUFFER_MINUTES. */
  low_buffer_hard_booking_count: number;
  /** Any hard booking would start after latest_arrival (strict). */
  has_deadline_miss: boolean;
  is_fragile: boolean;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
};

const MIN_SURVIVAL_BUFFER_MIN = 5;
const DEFAULT_SPEED_KMH = 30;

function toRad(x: number) {
  return (x * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
}

function extractCoords(it: any): { lat: number; lng: number } | null {
  const c =
    it?.location_ref?.coordinates ??
    it?.location_ref?.coord ??
    it?.metadata?.coordinates ??
    it?.metadata?.coord ??
    null;
  const lat = Number(c?.lat);
  const lng = Number(c?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function resolveTravelMinutesHaversine(cur: any, next: any): number {
  const a = extractCoords(cur);
  const b = extractCoords(next);
  if (!a || !b) return 0;
  const km = haversineKm(a, b);
  const min = (km / DEFAULT_SPEED_KMH) * 60;
  if (!Number.isFinite(min)) return 0;
  return Math.max(0, Math.min(240, Math.round(min)));
}

function resolveEndMs(it: any, startMs: number): number {
  const endIso = it?.end_time ?? it?.endTime;
  const end = typeof endIso === 'string' ? Date.parse(endIso) : NaN;
  if (Number.isFinite(end)) return end;
  const minDurMin = Number(it?.min_duration_minutes ?? it?.metadata?.min_duration_minutes ?? 0);
  const dur = Number.isFinite(minDurMin) ? Math.max(0, minDurMin) : 0;
  return startMs + dur * 60_000;
}

/**
 * Simulates the same rolling-delay absorption as `projectImpact`, then measures slack at each hard_booking
 * between shifted arrival and `latest_arrival_time` (no grace — conservative “punctuality pressure”).
 */
export async function computePostponeTimelineFragility(params: {
  itinerary: Itinerary | undefined;
  postponeMinutes: number;
  prefetchedEvidence: any[];
  resolveTravelMinutes?: (cur: any, next: any) => Promise<number | undefined>;
  findCachedTravelMinutes?: (cur: any, next: any) => number | undefined;
}): Promise<TimelineFragilityAssessment | null> {
  const itinerary = params.itinerary;
  if (!itinerary || !Number.isFinite(params.postponeMinutes) || params.postponeMinutes < 0) return null;

  const items: any[] = (itinerary.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
  const withTimes = items
    .map((it) => {
      const startIso = it?.start_time ?? it?.startTime;
      const t = typeof startIso === 'string' ? Date.parse(startIso) : NaN;
      return { it, t };
    })
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const planned = withTimes.filter((x) => String(x.it?.status ?? 'PLANNED').toUpperCase() === 'PLANNED');
  const bookings = planned.filter((x) => Boolean(x.it?.metadata?.hard_booking));
  if (planned.length === 0 || bookings.length === 0) return null;

  let rollingDelayMin = params.postponeMinutes;
  const bufferSamples: number[] = [];
  let lowBufferCount = 0;
  let hasDeadlineMiss = false;

  const resolveTravel = async (cur: any, next: any): Promise<number> => {
    const fromOverride = params.resolveTravelMinutes ? await params.resolveTravelMinutes(cur, next) : undefined;
    const fromCache = params.findCachedTravelMinutes ? params.findCachedTravelMinutes(cur, next) : undefined;
    return (
      fromOverride ??
      fromCache ??
      resolveTravelMinutesHaversine(cur, next)
    );
  };

  for (let idx = 0; idx < planned.length; idx++) {
    const p = planned[idx];

    if (Boolean(p.it?.metadata?.hard_booking)) {
      const eta = p.t + rollingDelayMin * 60_000;
      const latestIso =
        p.it?.metadata?.latest_arrival_time ??
        p.it?.metadata?.latest_arrival_time_iso ??
        p.it?.metadata?.booking_window_end_iso ??
        p.it?.start_time ??
        p.it?.startTime;
      const latest = typeof latestIso === 'string' ? Date.parse(latestIso) : p.t;
      if (Number.isFinite(latest)) {
        const bufferMin = (latest - eta) / 60_000;
        if (bufferMin < 0) {
          hasDeadlineMiss = true;
        } else {
          bufferSamples.push(bufferMin);
          if (bufferMin < FRAGILE_BUFFER_MINUTES) lowBufferCount += 1;
        }
      }
    }

    const next = idx + 1 < planned.length ? planned[idx + 1] : null;
    if (next) {
      const curEndMs = resolveEndMs(p.it, p.t);
      const nextStartMs = next.t;
      const gapMin = Math.max(0, (nextStartMs - curEndMs) / 60_000);
      const travelMin = await resolveTravel(p.it, next.it);
      const effectiveBuffer = Math.max(0, gapMin - travelMin - MIN_SURVIVAL_BUFFER_MIN);
      rollingDelayMin = Math.max(0, rollingDelayMin - effectiveBuffer);
    }
  }

  const finiteBuffers = bufferSamples.filter((b) => Number.isFinite(b) && b >= 0);
  const minBuffer = finiteBuffers.length ? Math.min(...finiteBuffers) : null;

  const is_fragile = hasDeadlineMiss || lowBufferCount > 0 || (minBuffer != null && minBuffer < FRAGILE_BUFFER_MINUTES);

  let risk_level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (
    hasDeadlineMiss ||
    (minBuffer != null && minBuffer <= HIGH_RISK_BUFFER_MINUTES) ||
    lowBufferCount >= HIGH_RISK_MULTI_FRAGILE_MIN_COUNT
  ) {
    risk_level = 'HIGH';
  } else if (minBuffer != null && minBuffer < FRAGILE_BUFFER_MINUTES) {
    risk_level = 'MEDIUM';
  } else if (is_fragile) {
    risk_level = 'MEDIUM';
  }

  return {
    min_buffer_minutes: minBuffer,
    low_buffer_hard_booking_count: lowBufferCount,
    has_deadline_miss: hasDeadlineMiss,
    is_fragile,
    risk_level,
  };
}

/**
 * Normalized punctuality headroom for radar UI: buffer minutes → [0,1].
 * score = clamp((min_buffer_minutes − 5) / 15, 0, 1). Undefined if no measurement.
 */
export function reliabilityScoreFromMinBuffer(minBufferMinutes: number | null | undefined): number | undefined {
  if (minBufferMinutes == null || !Number.isFinite(minBufferMinutes)) return undefined;
  return Math.max(0, Math.min(1, (minBufferMinutes - 5) / 15));
}
