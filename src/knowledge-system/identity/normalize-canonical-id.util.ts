/**
 * Normalize legacy runtime IDs → canonical form (Phase 1 adapter, no DB rewrite).
 */

export {
  isPlaceCanonicalId,
  normalizePlaceId,
  parsePlaceDbId,
  placeIsAliasForCanonical,
} from './normalize-place-id.util';

import { normalizePlaceId, parsePlaceDbId } from './normalize-place-id.util';

const PLACE_ID_RE = /^[a-z]{2}\.[a-z0-9_]+$/i;

/** seg_f208 | F208 | segment:is:f208 → segment:is:f208 */
export function normalizeSegmentId(raw: string, country = 'is'): string | null {
  const t = raw.trim();
  if (!t) return null;
  const mSeg = /^segment:([a-z]{2}):([a-z0-9_-]+)$/i.exec(t);
  if (mSeg) return `segment:${mSeg[1]!.toLowerCase()}:${mSeg[2]!.toLowerCase()}`;

  const mLegacy = /^seg[_-]?([a-z0-9_-]+)$/i.exec(t);
  if (mLegacy) {
    const slug = mLegacy[1]!.toLowerCase().replace(/^is[-_]?/, '');
    return `segment:${country}:${slug}`;
  }

  if (/^f?\d{2,4}[a-z]?$/i.test(t) || /^[a-z]?\d{1,4}[-_]?[a-z0-9]*$/i.test(t)) {
    return `segment:${country}:${t.toLowerCase()}`;
  }
  return null;
}

/** road authority codes → road:is:f208 */
export function normalizeRoadId(raw: string, country = 'is'): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^road:([a-z]{2}):([a-z0-9_-]+)$/i.exec(t);
  if (m) return `road:${m[1]!.toLowerCase()}:${m[2]!.toLowerCase()}`;
  const bare = t.replace(/^IS[-_]?/i, '').toLowerCase();
  if (/^[a-z0-9_-]+$/.test(bare)) return `road:${country}:${bare}`;
  return null;
}

/** trip_X_vehicle | vehicle:trip:X → vehicle:trip:X ; veh_1 → vehicle:legacy:veh_1 */
export function normalizeVehicleId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^vehicle:/i.test(t)) return t.toLowerCase();
  const trip = /^trip_(.+)_vehicle$/i.exec(t);
  if (trip) return `vehicle:trip:${trip[1]}`;
  if (/^veh[_-]?\w+$/i.test(t)) return `vehicle:legacy:${t.toLowerCase()}`;
  return null;
}

/** south_coast | wx_south_coast → weather-region:is:south_coast */
export function normalizeWeatherRegionId(raw: string, country = 'is'): string | null {
  const t = raw.trim();
  if (!t) return null;
  const m = /^weather-region:([a-z]{2}):([a-z0-9_-]+)$/i.exec(t);
  if (m) return `weather-region:${m[1]!.toLowerCase()}:${m[2]!.toLowerCase()}`;
  const slug = t.replace(/^wx[_-]?/i, '').toLowerCase();
  if (/^[a-z0-9_-]+$/.test(slug)) return `weather-region:${country}:${slug}`;
  return null;
}

export type NormalizedKind =
  | 'place'
  | 'segment'
  | 'road'
  | 'vehicle'
  | 'weather_region'
  | 'unknown';

export function tryNormalizeAny(
  raw: string,
): { kind: NormalizedKind; canonicalEntityId: string } | null {
  const place = normalizePlaceId(raw);
  if (place && PLACE_ID_RE.test(place)) return { kind: 'place', canonicalEntityId: place };

  if (/^seg[_-]/i.test(raw) || /^segment:/i.test(raw)) {
    const seg = normalizeSegmentId(raw);
    if (seg) return { kind: 'segment', canonicalEntityId: seg };
  }
  if (/^road:/i.test(raw) || /^IS-/i.test(raw) || /^F\d+/i.test(raw)) {
    const road = normalizeRoadId(raw);
    if (road) return { kind: 'road', canonicalEntityId: road };
  }
  if (/^veh/i.test(raw) || /^trip_.+_vehicle$/i.test(raw) || /^vehicle:/i.test(raw)) {
    const v = normalizeVehicleId(raw);
    if (v) return { kind: 'vehicle', canonicalEntityId: v };
  }
  if (
    /^wx[_-]/i.test(raw) ||
    /^weather-region:/i.test(raw) ||
    /coast|highland|west|north|east/i.test(raw)
  ) {
    const w = normalizeWeatherRegionId(raw);
    if (w) return { kind: 'weather_region', canonicalEntityId: w };
  }
  if (parsePlaceDbId(raw)) return null;
  return null;
}
