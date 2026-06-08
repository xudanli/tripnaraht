import {
  buildAccommodationPlaceMetadata,
  formatAccommodationCoordsNoteLine,
  isGooglePlaceId,
  parseCoordsFromRestNote,
  resolveAccommodationCoordinates,
} from '../../agent/utils/accommodation-place.util';

/** 无 Place 关联的 REST 住宿项：从 note / bookingUrl 合成前端展示用 Place 块 */
export function buildSyntheticPlaceForRestItineraryItem(item: {
  id: string;
  type?: string;
  note?: string | null;
  bookingUrl?: string | null;
  Place?: unknown;
}): Record<string, unknown> | null {
  if (item.Place || item.type !== 'REST') return null;
  const note = typeof item.note === 'string' ? item.note.trim() : '';
  if (!note) return null;

  const lines = note.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const nameCN = lines[0];
  if (!nameCN || nameCN === '酒店/住宿' || nameCN === 'Airbnb 民宿') return null;

  let address: string | undefined;
  let rating: number | undefined;
  let priceHint: string | undefined;
  for (const line of lines) {
    if (line.startsWith('地址:')) address = line.slice(3).trim();
    const ratingMatch = line.match(/^评分:\s*([\d.]+)/);
    if (ratingMatch) rating = parseFloat(ratingMatch[1]);
    if (line.startsWith('参考价:')) priceHint = line.slice(4).trim();
  }

  const coords = parseCoordsFromRestNote(note);

  return {
    id: 0,
    uuid: `synthetic-rest-${item.id}`,
    nameCN,
    nameEN: nameCN,
    category: 'HOTEL',
    address: address ?? null,
    rating: rating ?? 0,
    ...(coords
      ? {
          lat: coords.lat,
          lng: coords.lng,
          latitude: coords.lat,
          longitude: coords.lng,
          coordinates: { lat: coords.lat, lng: coords.lng },
        }
      : {}),
    metadata: {
      syntheticRestAccommodation: true,
      bookingUrl: item.bookingUrl ?? undefined,
      priceHint,
      itineraryItemId: item.id,
      ...(coords ? { coordinates: [coords.lng, coords.lat] } : {}),
    },
  };
}
