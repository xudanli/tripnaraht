/**
 * 活动/门票 Place：OTA 优先幂等 upsert（不依赖库内已有同名点）。
 * 主键：metadata.externalSource + metadata.externalId（飞猪 = poiId/productId）。
 */
import { randomUUID } from 'crypto';
import type { ActivityItemDto } from '../assistants/planning-assistant/dto/v2/shared/activity-item.dto';

export type ActivityOtaRef = {
  provider: 'fliggy' | 'google' | 'unknown';
  externalId: string;
};

export type UpsertActivityPlaceDeps = {
  findByExternalRef: (
    provider: string,
    externalId: string,
  ) => Promise<{ id: number } | null>;
  createPlace: (data: {
    uuid: string;
    nameCN: string;
    nameEN: string | null;
    category: 'ATTRACTION';
    address: string | null;
    googlePlaceId: string | null;
    rating: number;
    cityId: number | null;
    metadata: Record<string, unknown>;
    dataSource: string | null;
  }) => Promise<{ id: number }>;
  updatePlaceRow: (args: {
    id: number;
    nameCN: string;
    nameEN: string | null;
    address: string | null;
    cityId: number | null;
    metadata: Record<string, unknown>;
    dataSource: string | null;
    lat?: number;
    lng?: number;
  }) => Promise<void>;
  setLocation?: (id: number, lat: number, lng: number) => Promise<void>;
  resolveCityId?: (hint: string | null | undefined) => Promise<number | null>;
};

export function extractActivityOtaRef(
  act: Pick<ActivityItemDto, 'id' | 'source'> & {
    otaRef?: ActivityOtaRef;
    bookingProvider?: string;
  },
): ActivityOtaRef | null {
  if (act.otaRef?.provider && act.otaRef.externalId?.trim()) {
    return {
      provider: act.otaRef.provider,
      externalId: String(act.otaRef.externalId).trim(),
    };
  }
  const id = String(act.id ?? '').trim();
  if (!id) return null;
  if (act.source === 'fliggy' || act.bookingProvider === 'fliggy') {
    return { provider: 'fliggy', externalId: id };
  }
  return { provider: 'unknown', externalId: id };
}

export function resolveActivityCoordinates(
  act: Pick<ActivityItemDto, 'listing_lat' | 'listing_lng'> & {
    location?: { lat?: number; lng?: number };
  },
): { lat: number; lng: number } | null {
  const lat = act.location?.lat ?? act.listing_lat;
  const lng = act.location?.lng ?? act.listing_lng;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return null;
}

export function buildOtaActivityMetadata(
  act: ActivityItemDto & { otaRef?: ActivityOtaRef; bookingProvider?: string },
  coords: { lat: number; lng: number } | null,
): Record<string, unknown> {
  const ota = extractActivityOtaRef(act);
  return {
    ...(act.category ? { activityCategory: act.category } : {}),
    ...(act.priceLabel ? { priceLabel: act.priceLabel } : {}),
    ...(act.url ? { bookingUrl: act.url } : {}),
    ...(ota
      ? {
          externalSource: ota.provider,
          externalId: ota.externalId,
          otaRef: ota,
          ...(ota.provider === 'fliggy' ? { fliggyPoiId: ota.externalId } : {}),
        }
      : {}),
    ...(coords ? { coordinates: { lat: coords.lat, lng: coords.lng } } : {}),
  };
}

/**
 * Apply 时调用：按 OTA 外键复用/创建 Attraction Place；无坐标也可建。
 */
export async function upsertActivityPlaceForApply(
  deps: UpsertActivityPlaceDeps,
  activity: ActivityItemDto & {
    otaRef?: ActivityOtaRef;
    bookingProvider?: string;
  },
  displayName: string,
  opts?: { cityHint?: string | null },
): Promise<number | undefined> {
  const coords = resolveActivityCoordinates(activity);
  const ota = extractActivityOtaRef(activity);

  let cityId: number | null = null;
  if (deps.resolveCityId) {
    cityId =
      (await deps.resolveCityId(opts?.cityHint)) ??
      (await deps.resolveCityId(activity.address)) ??
      null;
  }

  const metadata = buildOtaActivityMetadata(activity, coords);
  const dataSource =
    ota?.provider === 'fliggy' ? 'fliggy' : ota?.provider === 'google' ? 'google' : 'ota_apply';

  try {
    if (ota && ota.provider !== 'unknown') {
      const existing = await deps.findByExternalRef(ota.provider, ota.externalId);
      if (existing) {
        await deps.updatePlaceRow({
          id: existing.id,
          nameCN: displayName,
          nameEN: activity.nameEn ?? activity.name ?? null,
          address: activity.address ?? null,
          cityId,
          metadata,
          dataSource,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        return existing.id;
      }
    }

    const allowWithoutCoords = ota?.provider === 'fliggy';
    if (!coords && !allowWithoutCoords) {
      return undefined;
    }

    const created = await deps.createPlace({
      uuid: randomUUID(),
      nameCN: displayName,
      nameEN: activity.nameEn ?? activity.name ?? null,
      category: 'ATTRACTION',
      address: activity.address ?? null,
      googlePlaceId: null,
      rating: 0,
      cityId,
      metadata,
      dataSource,
    });

    if (coords && deps.setLocation) {
      await deps.setLocation(created.id, coords.lat, coords.lng);
    }

    return created.id;
  } catch {
    return undefined;
  }
}
