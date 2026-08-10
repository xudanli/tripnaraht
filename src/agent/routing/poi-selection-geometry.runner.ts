/**
 * POI_SELECTION 几何 / 硬守卫工具（纯函数，从 ClaudeOrchestrator 迁出）。
 */

export function normalizeText(v: string): string {
  return v.trim().toLowerCase();
}

export function toPoiTraceNode(
  poi: any,
): { name: string; coordinates?: { lat: number; lng: number } } {
  const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
  const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
  return {
    name: String(poi?.name ?? ''),
    coordinates:
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined,
  };
}

export function tryExtractStartCoordinates(
  origin: unknown,
): { lat: number; lng: number } | undefined {
  if (!origin || typeof origin !== 'object') return undefined;
  const lat = Number((origin as any)?.lat ?? NaN);
  const lng = Number((origin as any)?.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRadians = (v: number): number => (v * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadius * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

export function estimateCommuteMinutesFromMode(
  km: number,
  mode?: 'walk' | 'drive' | 'transit' | 'mixed',
): number {
  const kmh =
    mode === 'walk' ? 4.5 : mode === 'drive' ? 24 : mode === 'transit' ? 16 : 10;
  return Math.max(5, Math.round((km / Math.max(1, kmh)) * 60));
}

export function isPoiWithinDestinationBounds(poi: any, destinationRaw?: string): boolean {
  const d = normalizeText(String(destinationRaw ?? ''));
  if (!d) return true;
  const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
  const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;

  if (/冰岛|iceland/.test(d)) {
    return lat >= 63 && lat <= 67.8 && lng >= -25.5 && lng <= -13.0;
  }
  if (/东京|tokyo/.test(d)) {
    return lat >= 35.4 && lat <= 35.9 && lng >= 139.4 && lng <= 140.1;
  }
  return true;
}

export function passesHardPoiGuards(
  poi: any,
  destinationCountry?: string,
  destinationRaw?: string,
): boolean {
  if (
    destinationCountry === 'IS' &&
    (poi?.poi_planning_anchor_slug ||
      poi?.source === 'poi_planning_fallback' ||
      poi?.source === 'poi_planning_matched_existing')
  ) {
    return true;
  }
  const riskLevel = String(poi?.metadata?.risk_level ?? '').toUpperCase();
  if (riskLevel === 'HIGH') return false;
  if (!poi?.name) return false;
  if (!poi?.address && !poi?.coordinates) return false;
  const category = String(poi?.category ?? poi?.type ?? '').toUpperCase();
  if (
    /(HOSPITAL|TRANSIT_HUB|GAS_STATION|CLINIC|AIRPORT_SERVICE|HOTEL|LODGING|ACCOMMODATION)/.test(
      category,
    )
  ) {
    return false;
  }
  if (!isPoiWithinDestinationBounds(poi, destinationRaw)) return false;
  if (!destinationCountry) return true;
  const poiCountry = String(
    poi?.countryCode ?? poi?.country_code ?? poi?.metadata?.countryCode ?? '',
  ).toUpperCase();
  if (poiCountry && poiCountry !== destinationCountry) return false;
  return true;
}

export function selectClusteredPois(
  candidates: any[],
  limit: number,
  startCoordinates?: { lat: number; lng: number },
  destinationRaw?: string,
): any[] {
  if (!Array.isArray(candidates) || candidates.length <= 1) {
    return Array.isArray(candidates) ? candidates.slice(0, limit) : [];
  }
  const maxLegKm = /冰岛|iceland/i.test(String(destinationRaw ?? '')) ? 60 : 35;
  const selected: any[] = [];
  const anchors: Array<{ lat: number; lng: number }> = [];
  if (startCoordinates) anchors.push(startCoordinates);
  for (const poi of candidates) {
    if (selected.length >= limit) break;
    const lat = Number(poi?.coordinates?.lat ?? poi?.lat ?? NaN);
    const lng = Number(poi?.coordinates?.lng ?? poi?.lng ?? NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      selected.push(poi);
      continue;
    }
    if (anchors.length === 0) {
      selected.push(poi);
      anchors.push({ lat, lng });
      continue;
    }
    const nearest = Math.min(...anchors.map((a) => haversineKm(a, { lat, lng })));
    if (nearest <= maxLegKm) {
      selected.push(poi);
      anchors.push({ lat, lng });
    }
  }
  if (selected.length === 0) return candidates.slice(0, limit);
  return selected.slice(0, limit);
}

export function buildPoiTraceCommuteMatrix(
  selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
  mode?: 'walk' | 'drive' | 'transit' | 'mixed',
  startCoordinates?: { lat: number; lng: number },
): {
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  from_start?: boolean;
  nodes?: string[];
  minutes?: number[][];
} | undefined {
  const valid = selected.filter((x) => !!x.coordinates);
  if (valid.length === 0) return undefined;
  const n = valid.length;
  const rows: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const km = haversineKm(valid[i].coordinates!, valid[j].coordinates!);
      rows[i][j] = estimateCommuteMinutesFromMode(km, mode);
    }
  }
  const nodes = valid.map((x) => x.name);
  if (!startCoordinates) {
    return { mode, from_start: false, nodes, minutes: rows };
  }
  const startRow = valid.map((x) => {
    const km = haversineKm(startCoordinates, x.coordinates!);
    return estimateCommuteMinutesFromMode(km, mode);
  });
  return {
    mode,
    from_start: true,
    nodes: ['START', ...nodes],
    minutes: [startRow, ...rows],
  };
}

export function estimateNearestTotalCommuteMinutes(
  selected: Array<{ name: string; coordinates?: { lat: number; lng: number } }>,
  mode?: 'walk' | 'drive' | 'transit' | 'mixed',
  startCoordinates?: { lat: number; lng: number },
): number {
  const valid = selected.filter((x) => !!x.coordinates);
  if (valid.length <= 1) return 0;
  const remaining = valid.map((x) => x.coordinates!) as Array<{
    lat: number;
    lng: number;
  }>;
  let current = startCoordinates ?? remaining[0];
  let total = 0;
  const visited = new Set<number>();
  while (visited.size < remaining.length) {
    let bestIdx = -1;
    let bestMinutes = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      if (visited.has(i)) continue;
      const km = haversineKm(current, remaining[i]);
      const m = estimateCommuteMinutesFromMode(km, mode);
      if (m < bestMinutes) {
        bestMinutes = m;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || !Number.isFinite(bestMinutes)) break;
    total += bestMinutes;
    current = remaining[bestIdx];
    visited.add(bestIdx);
  }
  return total;
}

export function poiLocalityScore(
  poi: any,
  destinationCountry?: string,
  destinationCity?: string,
): number {
  let score = 0;
  const address = normalizeText(String(poi?.address ?? ''));
  const name = normalizeText(String(poi?.name ?? ''));
  const poiCountry = String(
    poi?.countryCode ?? poi?.country_code ?? poi?.metadata?.countryCode ?? '',
  ).toUpperCase();

  if (destinationCountry && poiCountry) {
    score += poiCountry === destinationCountry ? 2 : -3;
  }

  if (destinationCity) {
    if (name.includes(destinationCity)) score += 2;
    if (address.includes(destinationCity)) score += 1.5;
  }
  return score;
}
