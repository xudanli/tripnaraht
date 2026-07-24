import type { AccommodationItemDto } from '../assistants/planning-assistant/dto/v2/shared/accommodation-item.dto';
import type { RouteAndRunAccommodationCard } from './hotel-mcp-route-run.mapper';

type LooseAccommodation = Partial<AccommodationItemDto> &
  Partial<RouteAndRunAccommodationCard> & {
    check_in?: string;
    check_out?: string;
    name_en?: string;
    priceLabel?: string;
    photo_url?: string;
    listing_lat?: number;
    listing_lng?: number;
    title?: string;
    hotelName?: string;
  };

/** apply 入参：DTO、route_and_run 卡片或 accommodationCard 快照 */
export type AccommodationApplyInput =
  | AccommodationItemDto
  | LooseAccommodation
  | Record<string, unknown>;

function pickNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** 从 route_and_run 卡片 / 会话缓存 / apply 请求体合并出完整 AccommodationItemDto */
export function coalesceAccommodationForApply(
  primary?: AccommodationApplyInput | null,
  fallback?: AccommodationApplyInput | null,
): AccommodationItemDto {
  const raw: LooseAccommodation = {
    ...(fallback ?? {}),
    ...(primary ?? {}),
  } as LooseAccommodation;
  const name = resolveAccommodationDisplayName(raw);
  const checkIn = pickNonEmptyString(raw.checkIn, raw.check_in);
  const checkOut = pickNonEmptyString(raw.checkOut, raw.check_out);
  const price = pickNonEmptyString(raw.price, raw.priceLabel);
  const url = pickNonEmptyString(raw.url);
  const photoUrl = pickNonEmptyString(raw.photoUrl, raw.photo_url);
  const lat = raw.location?.lat ?? raw.listing_lat;
  const lng = raw.location?.lng ?? raw.listing_lng;

  return {
    id: String(raw.id ?? ''),
    source: raw.source === 'airbnb' ? 'airbnb' : 'hotel',
    name,
    ...(pickNonEmptyString(raw.nameCN) ? { nameCN: pickNonEmptyString(raw.nameCN) } : {}),
    ...(pickNonEmptyString(raw.nameEN, raw.name_en) ? { nameEN: pickNonEmptyString(raw.nameEN, raw.name_en) } : {}),
    ...(pickNonEmptyString(raw.address) ? { address: pickNonEmptyString(raw.address) } : {}),
    ...(pickNonEmptyString(raw.roomSpecs) ? { roomSpecs: pickNonEmptyString(raw.roomSpecs) } : {}),
    ...(typeof lat === 'number' && typeof lng === 'number' ? { location: { lat, lng } } : {}),
    ...(typeof raw.rating === 'number' ? { rating: raw.rating } : {}),
    ...(typeof raw.ratingCount === 'number' ? { ratingCount: raw.ratingCount } : {}),
    ...(price ? { price } : {}),
    ...(url ? { url } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...(Array.isArray(raw.photos) && raw.photos.length ? { photos: raw.photos as string[] } : {}),
    ...(checkIn ? { checkIn: checkIn.split('T')[0] } : {}),
    ...(checkOut ? { checkOut: checkOut.split('T')[0] } : {}),
    ...(typeof raw.nightIndex === 'number' ? { nightIndex: raw.nightIndex } : {}),
    ...(typeof raw.distanceKm === 'number'
      ? { distanceKm: raw.distanceKm }
      : typeof raw.distance_to_anchor_km === 'number'
        ? { distanceKm: raw.distance_to_anchor_km }
        : {}),
    ...(pickNonEmptyString(raw.anchor_poi_name_zh) ? { anchor_poi_name_zh: pickNonEmptyString(raw.anchor_poi_name_zh) } : {}),
    ...(pickNonEmptyString(raw.distance_label_zh) ? { distance_label_zh: pickNonEmptyString(raw.distance_label_zh) } : {}),
    ...(pickNonEmptyString(raw.decision_support_zh) ? { decision_support_zh: pickNonEmptyString(raw.decision_support_zh) } : {}),
  };
}

export function resolveAccommodationDisplayName(raw: AccommodationApplyInput): string {
  const card = raw as LooseAccommodation;
  return (
    pickNonEmptyString(
      card.name,
      card.nameCN,
      card.nameEN,
      card.name_en,
      card.title,
      card.hotelName,
    ) ?? 'Listing'
  );
}
