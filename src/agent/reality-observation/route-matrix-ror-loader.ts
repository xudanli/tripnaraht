/**
 * ROR 段间行程时长矩阵：优先 Google Routes，其次行程项时长，最后 Haversine 估算。
 */

export type RorLatLng = { lat: number; lng: number };

export type RorRouteLegInput = {
  from: RorLatLng | null;
  to: RorLatLng | null;
  fromLabel?: string;
  toLabel?: string;
  /** ItineraryItem.travelFromPreviousDuration */
  fallbackMinutes?: number | null;
};

export type RorGoogleRoutesPort = {
  getRoutes: (
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode?: 'TRANSIT' | 'WALKING' | 'DRIVING',
  ) => Promise<Array<{ durationMinutes: number }>>;
};

export type RorRouteMatrixLeg = {
  fromLabel?: string;
  toLabel?: string;
  minutes: number;
  source: 'GOOGLE_ROUTES' | 'ITINERARY' | 'HAVERSINE_ESTIMATE';
  distanceKm?: number;
};

export type RorRouteTravelTimeMatrix = {
  totalMinutes: number;
  legs: RorRouteMatrixLeg[];
  provider: 'GOOGLE_ROUTES' | 'ITINERARY' | 'MIXED' | 'HAVERSINE_ESTIMATE';
  travelMode: 'DRIVING' | 'TRANSIT' | 'WALKING';
  observedAt: string;
};

/** 冰岛自驾粗估：平均约 55 km/h（含弯路/观景减速） */
const DEFAULT_AVG_KMH = 55;

export function haversineKm(a: RorLatLng, b: RorLatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function estimateDriveMinutesHaversine(
  a: RorLatLng,
  b: RorLatLng,
  avgKmh: number = DEFAULT_AVG_KMH,
): { minutes: number; distanceKm: number } {
  const distanceKm = haversineKm(a, b);
  const minutes = Math.max(5, Math.round((distanceKm / Math.max(1, avgKmh)) * 60));
  return { minutes, distanceKm: Math.round(distanceKm * 10) / 10 };
}

export function hasFetchableRouteCoords(legs: readonly RorRouteLegInput[]): boolean {
  return legs.some((l) => l.from != null && l.to != null);
}

/**
 * 装载 route.travelTimeMatrix。无腿且无合计提示时返回 null。
 */
export async function loadRouteTravelTimeMatrixForRor(
  routes: RorGoogleRoutesPort | undefined,
  legs: readonly RorRouteLegInput[],
  opts?: {
    travelMode?: 'DRIVING' | 'TRANSIT' | 'WALKING';
    /** 无坐标时的全日行驶合计 fallback */
    totalFallbackMinutes?: number | null;
  },
): Promise<RorRouteTravelTimeMatrix | null> {
  const travelMode = opts?.travelMode ?? 'DRIVING';
  const observedAt = new Date().toISOString();

  if (!legs.length) {
    const total = Number(opts?.totalFallbackMinutes) || 0;
    if (total <= 0) return null;
    return {
      totalMinutes: total,
      legs: [],
      provider: 'ITINERARY',
      travelMode,
      observedAt,
    };
  }

  const outLegs: RorRouteMatrixLeg[] = [];

  for (const leg of legs) {
    const fb = Number(leg.fallbackMinutes) || 0;
    if (leg.from && leg.to && routes?.getRoutes) {
      try {
        const options = await routes.getRoutes(
          leg.from.lat,
          leg.from.lng,
          leg.to.lat,
          leg.to.lng,
          travelMode,
        );
        const best = options
          .map((o) => Number(o.durationMinutes) || 0)
          .filter((m) => m > 0)
          .sort((a, b) => a - b)[0];
        if (best != null && best > 0) {
          outLegs.push({
            fromLabel: leg.fromLabel,
            toLabel: leg.toLabel,
            minutes: best,
            source: 'GOOGLE_ROUTES',
            distanceKm: Math.round(haversineKm(leg.from, leg.to) * 10) / 10,
          });
          continue;
        }
      } catch {
        /* fall through */
      }
    }

    if (fb > 0) {
      outLegs.push({
        fromLabel: leg.fromLabel,
        toLabel: leg.toLabel,
        minutes: fb,
        source: 'ITINERARY',
      });
      continue;
    }

    if (leg.from && leg.to) {
      const est = estimateDriveMinutesHaversine(leg.from, leg.to);
      outLegs.push({
        fromLabel: leg.fromLabel,
        toLabel: leg.toLabel,
        minutes: est.minutes,
        source: 'HAVERSINE_ESTIMATE',
        distanceKm: est.distanceKm,
      });
      continue;
    }

    /* 跳过无法估计的腿 */
  }

  if (!outLegs.length) {
    const total = Number(opts?.totalFallbackMinutes) || 0;
    if (total <= 0) return null;
    return {
      totalMinutes: total,
      legs: [],
      provider: 'ITINERARY',
      travelMode,
      observedAt,
    };
  }

  const sources = new Set(outLegs.map((l) => l.source));
  let provider: RorRouteTravelTimeMatrix['provider'] = 'MIXED';
  if (sources.size === 1) {
    const only = [...sources][0];
    provider =
      only === 'GOOGLE_ROUTES'
        ? 'GOOGLE_ROUTES'
        : only === 'ITINERARY'
          ? 'ITINERARY'
          : 'HAVERSINE_ESTIMATE';
  }

  return {
    totalMinutes: outLegs.reduce((s, l) => s + l.minutes, 0),
    legs: outLegs,
    provider,
    travelMode,
    observedAt,
  };
}
