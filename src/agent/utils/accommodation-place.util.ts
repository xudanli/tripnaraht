import type { AccommodationItemDto } from '../assistants/planning-assistant/dto/v2/shared/accommodation-item.dto';

export function resolveAccommodationCoordinates(
  acc: AccommodationItemDto & { listing_lat?: number; listing_lng?: number },
): { lat: number; lng: number } | null {
  const lat = acc.location?.lat ?? acc.listing_lat;
  const lng = acc.location?.lng ?? acc.listing_lng;
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

export function isGooglePlaceId(id: string): boolean {
  const trimmed = id.trim();
  return /^ChIJ[A-Za-z0-9_-]+$/.test(trimmed) || trimmed.startsWith('places/');
}

export function buildAccommodationPlaceMetadata(
  acc: AccommodationItemDto,
): Record<string, unknown> {
  return {
    accommodationSource: acc.source,
    accommodationId: acc.id,
    ...(acc.photoUrl ? { photoUrl: acc.photoUrl } : {}),
    ...(acc.url ? { bookingUrl: acc.url } : {}),
    importedFrom: 'planning_assistant_apply',
  };
}

/** 写入 note 供无 Place 时解析坐标（兜底） */
export function formatAccommodationCoordsNoteLine(lat: number, lng: number): string {
  return `坐标: ${lat}, ${lng}`;
}

/** 从 REST 住宿 note 解析坐标行 */
export function parseCoordsFromRestNote(note: string): { lat: number; lng: number } | null {
  for (const line of note.split('\n')) {
    const trimmed = line.trim();
    const m = trimmed.match(/^坐标:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}
