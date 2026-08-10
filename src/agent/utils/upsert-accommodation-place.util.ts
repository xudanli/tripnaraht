/**
 * 住宿 Place：OTA 优先幂等 upsert（不依赖库内已有同名点）。
 * 主键：metadata.externalSource + metadata.externalId（飞猪 = shId）。
 */
import { randomUUID } from 'crypto';
import type { AccommodationItemDto } from '../assistants/planning-assistant/dto/v2/shared/accommodation-item.dto';
import {
  buildAccommodationPlaceMetadata,
  isGooglePlaceId,
  resolveAccommodationCoordinates,
} from './accommodation-place.util';

export type AccommodationOtaRef = {
  provider: 'fliggy' | 'airbnb' | 'google' | 'unknown';
  externalId: string;
};

export type UpsertAccommodationPlaceDeps = {
  findByGooglePlaceId: (googlePlaceId: string) => Promise<{ id: number } | null>;
  findByExternalRef: (
    provider: string,
    externalId: string,
  ) => Promise<{ id: number } | null>;
  createPlace: (data: {
    uuid: string;
    nameCN: string;
    nameEN: string | null;
    category: 'HOTEL';
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
    rating: number | null;
    cityId: number | null;
    metadata: Record<string, unknown>;
    dataSource: string | null;
    lat?: number;
    lng?: number;
  }) => Promise<void>;
  setLocation?: (id: number, lat: number, lng: number) => Promise<void>;
  resolveCityId?: (hint: string | null | undefined) => Promise<number | null>;
};

export function extractAccommodationOtaRef(
  acc: Pick<AccommodationItemDto, 'id' | 'source'> & {
    otaRef?: AccommodationOtaRef;
    bookingProvider?: string;
    placeId?: string;
  },
): AccommodationOtaRef | null {
  if (acc.otaRef?.provider && acc.otaRef.externalId?.trim()) {
    return {
      provider: acc.otaRef.provider,
      externalId: String(acc.otaRef.externalId).trim(),
    };
  }
  const id = String(acc.id ?? '').trim();
  if (!id) return null;
  if (acc.source === 'fliggy' || acc.bookingProvider === 'fliggy') {
    return { provider: 'fliggy', externalId: id };
  }
  if (acc.source === 'airbnb') {
    return { provider: 'airbnb', externalId: id };
  }
  if (acc.source === 'hotel' && isGooglePlaceId(id)) {
    return { provider: 'google', externalId: id };
  }
  return { provider: 'unknown', externalId: id };
}

export function buildOtaAccommodationMetadata(
  acc: AccommodationItemDto & { otaRef?: AccommodationOtaRef; bookingProvider?: string },
  coords: { lat: number; lng: number } | null,
): Record<string, unknown> {
  const ota = extractAccommodationOtaRef(acc);
  const base = buildAccommodationPlaceMetadata(acc);
  return {
    ...base,
    ...(ota
      ? {
          externalSource: ota.provider,
          externalId: ota.externalId,
          otaRef: ota,
          ...(ota.provider === 'fliggy' ? { fliggyShId: ota.externalId } : {}),
        }
      : {}),
    ...(coords ? { coordinates: { lat: coords.lat, lng: coords.lng } } : {}),
  };
}

/**
 * Apply 时调用：按 OTA 外键复用/创建 Place；无坐标也可建（地图后续再补）。
 */
export async function upsertAccommodationPlaceForApply(
  deps: UpsertAccommodationPlaceDeps,
  accommodation: AccommodationItemDto & {
    otaRef?: AccommodationOtaRef;
    bookingProvider?: string;
    placeId?: string;
  },
  displayName: string,
  opts?: { cityHint?: string | null },
): Promise<number | undefined> {
  const coords = resolveAccommodationCoordinates(accommodation);
  const ota = extractAccommodationOtaRef(accommodation);
  const googlePlaceId =
    ota?.provider === 'google'
      ? ota.externalId
      : accommodation.source === 'hotel' && isGooglePlaceId(accommodation.id)
        ? accommodation.id.trim()
        : undefined;

  let cityId: number | null = null;
  if (deps.resolveCityId) {
    cityId =
      (await deps.resolveCityId(opts?.cityHint)) ??
      (await deps.resolveCityId(accommodation.address)) ??
      null;
  }

  const metadata = buildOtaAccommodationMetadata(accommodation, coords);
  const dataSource =
    ota?.provider === 'fliggy'
      ? 'fliggy'
      : ota?.provider === 'airbnb'
        ? 'airbnb'
        : ota?.provider === 'google'
          ? 'google'
          : 'ota_apply';

  try {
    if (googlePlaceId) {
      const existing = await deps.findByGooglePlaceId(googlePlaceId);
      if (existing) {
        await deps.updatePlaceRow({
          id: existing.id,
          nameCN: displayName,
          nameEN: accommodation.nameEN ?? accommodation.name ?? null,
          address: accommodation.address ?? null,
          rating: accommodation.rating ?? null,
          cityId,
          metadata,
          dataSource,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        return existing.id;
      }
    }

    if (ota && ota.provider !== 'unknown') {
      const existing = await deps.findByExternalRef(ota.provider, ota.externalId);
      if (existing) {
        await deps.updatePlaceRow({
          id: existing.id,
          nameCN: displayName,
          nameEN: accommodation.nameEN ?? accommodation.name ?? null,
          address: accommodation.address ?? null,
          rating: accommodation.rating ?? null,
          cityId,
          metadata,
          dataSource,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        });
        return existing.id;
      }
    }

    // 飞猪/Airbnb：无坐标也允许建 Place（库不全时的主路径）
    const allowWithoutCoords =
      ota?.provider === 'fliggy' || ota?.provider === 'airbnb';
    if (!coords && !allowWithoutCoords) {
      return undefined;
    }

    const created = await deps.createPlace({
      uuid: randomUUID(),
      nameCN: displayName,
      nameEN: accommodation.nameEN ?? accommodation.name ?? null,
      category: 'HOTEL',
      address: accommodation.address ?? null,
      googlePlaceId: googlePlaceId ?? null,
      rating: accommodation.rating ?? 0,
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
