/**
 * 冰岛 POI  canonical 坐标：当库内 PostGIS 点偏离冰岛范围时用于距离/路线计算。
 * 381037 等条目曾出现 nameEN 与坐标错配（如 Sheffield「Rules」）。
 */

export function isPlausibleIcelandPoiCoord(lat: number, lng: number): boolean {
  return lat >= 63 && lat <= 67.8 && lng >= -24.9 && lng <= -12.5;
}

/** 按 Place.id 的权威坐标（WGS84） */
export const ICELAND_CANONICAL_POI_BY_PLACE_ID: Record<
  number,
  { lat: number; lng: number; nameEN?: string }
> = {
  /** 辛格维利尔国家公园 — 曾错绑 Sheffield 坐标 */
  381037: { lat: 64.255, lng: -21.129, nameEN: 'Thingvellir National Park' },
};

export type EffectivePlaceCoordinates = {
  lat: number;
  lng: number;
  corrected: boolean;
};

export function resolveEffectiveIcelandPlaceCoordinates(input: {
  id: number;
  nameEN?: string | null;
  nameCN?: string | null;
  metadata?: unknown;
  lat?: number | null;
  lng?: number | null;
}): EffectivePlaceCoordinates | null {
  const lat = input.lat != null ? Number(input.lat) : null;
  const lng = input.lng != null ? Number(input.lng) : null;

  const canonical = ICELAND_CANONICAL_POI_BY_PLACE_ID[input.id];
  if (canonical) {
    if (lat == null || lng == null || !isPlausibleIcelandPoiCoord(lat, lng)) {
      return { lat: canonical.lat, lng: canonical.lng, corrected: true };
    }
    return { lat, lng, corrected: false };
  }

  const meta = input.metadata as Record<string, unknown> | undefined;
  const metaNameIs = typeof meta?.name_is === 'string' ? meta.name_is : '';
  const isThingvellirMeta =
    metaNameIs === 'Þingvellir' ||
    meta?.region === 'Golden Circle' ||
    /thingvellir|þingvellir|辛格维利尔/i.test(String(input.nameCN ?? input.nameEN ?? ''));

  if (isThingvellirMeta && lat != null && lng != null && !isPlausibleIcelandPoiCoord(lat, lng)) {
    return { lat: 64.255, lng: -21.129, corrected: true };
  }

  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, corrected: false };
  }
  return null;
}
