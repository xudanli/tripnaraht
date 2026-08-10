/**
 * Lightweight WGS84 coords + drive-time heuristic for Initial Plan day-assign.
 * Prefer real catalog coords when available; this map covers Golden Set placeIds.
 */

export type LatLng = { lat: number; lng: number };

/** Known planning placeIds (Golden Set + GC secondaries). */
export const ICELAND_PLANNING_PLACE_COORDS: Record<number, LatLng> = {
  // Arrival / Reykjanes / gateways
  381221: { lat: 63.985, lng: -22.605 }, // Keflavík Airport (KEF)
  381090: { lat: 63.8804, lng: -22.4495 }, // Blue Lagoon
  381042: { lat: 64.1466, lng: -21.9426 }, // Reykjavík hub
  381097: { lat: 65.6835, lng: -18.1002 }, // Akureyri hub / AEY proxy
  // Golden Circle classic
  381037: { lat: 64.255, lng: -21.129 }, // Þingvellir
  381083: { lat: 64.3103, lng: -20.3011 }, // Geysir
  381084: { lat: 64.3253, lng: -20.1237 }, // Gullfoss
  // Golden Circle secondaries (catalog-backed)
  389399: { lat: 64.0417, lng: -20.8831 }, // Kerið
  388608: { lat: 64.2642, lng: -20.5159 }, // Brúarfoss
  388566: { lat: 64.2259, lng: -20.3385 }, // Faxafoss
  389622: { lat: 64.2146, lng: -20.7302 }, // Laugarvatn Fontana
  // South coast samples
  381080: { lat: 63.6156, lng: -19.9886 },
  381038: { lat: 63.5321, lng: -19.5113 },
  381039: { lat: 63.4045, lng: -19.07 },
  381082: { lat: 63.4026, lng: -19.1264 },
  381045: { lat: 63.4186, lng: -19.006 }, // Vík Hostel approx
  381041: { lat: 64.0475, lng: -16.1783 },
  381089: { lat: 64.0444, lng: -16.177 },
  381088: { lat: 64.0704, lng: -16.9753 },
  // Highlands
  381108: { lat: 63.992, lng: -19.061 },
  381111: { lat: 65.035, lng: -16.75 },
  381109: { lat: 63.683, lng: -19.511 },
  381127: { lat: 63.992, lng: -19.061 },
  381122: { lat: 65.045, lng: -16.75 },
};

const FALLBACK_LEG_MIN = 30;
/** Rural Iceland average including gravel / stops factor */
const AVG_ROAD_KMH = 55;

export function resolvePlanningPlaceCoords(
  placeId: number | undefined | null,
): LatLng | null {
  if (placeId == null || placeId <= 0) return null;
  return ICELAND_PLANNING_PLACE_COORDS[placeId] ?? null;
}

export function haversineKm(a: LatLng, b: LatLng): number {
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

/**
 * Estimate one-way drive minutes between two placeIds.
 * Missing coords → FALLBACK_LEG_MIN (does not invent geography).
 */
export function estimateDriveMinutesBetweenPlaces(
  fromPlaceId: number | undefined | null,
  toPlaceId: number | undefined | null,
): number {
  if (fromPlaceId == null || toPlaceId == null) return 0;
  if (fromPlaceId === toPlaceId) return 0;
  const a = resolvePlanningPlaceCoords(fromPlaceId);
  const b = resolvePlanningPlaceCoords(toPlaceId);
  if (!a || !b) return FALLBACK_LEG_MIN;
  const km = haversineKm(a, b);
  // Road factor ~1.25 vs straight-line for Iceland corridors
  const roadKm = km * 1.25;
  return Math.max(12, Math.round((roadKm / AVG_ROAD_KMH) * 60));
}

/** Nearest-neighbor order starting from `startPlaceId` (or first node). */
export function orderPlaceIdsByNearestNeighbor(
  placeIds: number[],
  startPlaceId?: number | null,
): number[] {
  if (placeIds.length <= 1) return [...placeIds];
  const remaining = [...placeIds];
  const ordered: number[] = [];
  let current: number | null =
    startPlaceId != null && remaining.includes(startPlaceId)
      ? startPlaceId
      : remaining[0]!;
  if (current != null && remaining.includes(current)) {
    ordered.push(current);
    remaining.splice(remaining.indexOf(current), 1);
  } else if (startPlaceId != null) {
    // start is a hotel (not in list) — pick attraction closest to hotel first
    let bestIdx = 0;
    let bestMin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = estimateDriveMinutesBetweenPlaces(startPlaceId, remaining[i]!);
      if (d < bestMin) {
        bestMin = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }
  while (remaining.length) {
    let bestIdx = 0;
    let bestMin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = estimateDriveMinutesBetweenPlaces(current, remaining[i]!);
      if (d < bestMin) {
        bestMin = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }
  return ordered;
}

/**
 * Order attractions between overnight hotels:
 * wake at startHotel → tour → sleep at endHotel.
 * Last stop prefers proximity to endHotel when 2 remain.
 */
export function orderPlaceIdsHotelAnchored(
  placeIds: number[],
  startHotelPlaceId?: number | null,
  endHotelPlaceId?: number | null,
): number[] {
  if (placeIds.length <= 1) return [...placeIds];
  if (!startHotelPlaceId && !endHotelPlaceId) {
    return orderPlaceIdsByNearestNeighbor(placeIds);
  }

  const remaining = [...placeIds];
  const ordered: number[] = [];

  // First: closest to morning hotel (or NN seed)
  let bestIdx = 0;
  let bestMin = Number.POSITIVE_INFINITY;
  for (let i = 0; i < remaining.length; i++) {
    const d = startHotelPlaceId
      ? estimateDriveMinutesBetweenPlaces(startHotelPlaceId, remaining[i]!)
      : 0;
    if (d < bestMin) {
      bestMin = d;
      bestIdx = i;
    }
  }
  let current = remaining.splice(bestIdx, 1)[0]!;
  ordered.push(current);

  while (remaining.length > 0) {
    if (endHotelPlaceId != null && remaining.length === 2) {
      const a = remaining[0]!;
      const b = remaining[1]!;
      const aToHotel = estimateDriveMinutesBetweenPlaces(a, endHotelPlaceId);
      const bToHotel = estimateDriveMinutesBetweenPlaces(b, endHotelPlaceId);
      // Leave closer-to-hotel for last
      const last = aToHotel <= bToHotel ? a : b;
      const next = last === a ? b : a;
      ordered.push(next);
      ordered.push(last);
      remaining.length = 0;
      break;
    }
    if (endHotelPlaceId != null && remaining.length === 1) {
      ordered.push(remaining.pop()!);
      break;
    }
    bestIdx = 0;
    bestMin = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = estimateDriveMinutesBetweenPlaces(current, remaining[i]!);
      if (d < bestMin) {
        bestMin = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(current);
  }

  return ordered;
}

export function sumRouteDriveMinutes(placeIds: number[]): number {
  let total = 0;
  for (let i = 1; i < placeIds.length; i++) {
    total += estimateDriveMinutesBetweenPlaces(placeIds[i - 1], placeIds[i]);
  }
  return total;
}

/** Morning hotel → first + legs + last → evening hotel */
export function sumDayDriveWithHotels(
  placeIds: number[],
  startHotelPlaceId?: number | null,
  endHotelPlaceId?: number | null,
): number {
  if (!placeIds.length) {
    return estimateDriveMinutesBetweenPlaces(startHotelPlaceId, endHotelPlaceId);
  }
  let total = estimateDriveMinutesBetweenPlaces(startHotelPlaceId, placeIds[0]);
  total += sumRouteDriveMinutes(placeIds);
  total += estimateDriveMinutesBetweenPlaces(
    placeIds[placeIds.length - 1],
    endHotelPlaceId,
  );
  return total;
}
