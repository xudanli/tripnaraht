/**
 * Trip cover image resolution — mirrors frontend `trip-cover.util.ts`.
 *
 * Priority:
 * 1. metadata.coverImageSource === 'poi'|'user' + coverImageUrl → use directly
 * 2. metadata.coverImageSource === 'auto' or unset → hash(tripId) % n from POI pool
 * 3. no POI images → Country.coverImageUrl
 * 4. still none → null
 */

export type CoverImageSource = 'poi' | 'user' | 'auto';

export function readCoverImageSource(metadata: unknown): CoverImageSource | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const source = (metadata as Record<string, unknown>).coverImageSource;
  if (source === 'poi' || source === 'user' || source === 'auto') return source;
  return null;
}

export function readExplicitCoverImageUrl(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const url = (metadata as Record<string, unknown>).coverImageUrl;
  if (typeof url === 'string' && url.trim().length > 0) return url.trim();
  return null;
}

/** Collect image URLs from a single Place metadata (uploaded images + direct fields). */
export function collectPlaceImages(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];

  const meta = metadata as Record<string, unknown>;
  const urls: string[] = [];
  const seen = new Set<string>();

  const addUrl = (value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };

  for (const key of ['imageUrl', 'image', 'coverImage', 'photoUrl']) {
    addUrl(meta[key]);
  }

  const images = meta.images;
  if (Array.isArray(images)) {
    for (const img of images) {
      if (typeof img === 'string') {
        addUrl(img);
      } else if (img && typeof img === 'object') {
        addUrl((img as { url?: string }).url);
      }
    }
  }

  return urls;
}

/** Merge POI images from itinerary places, preserving first-seen order. */
export function collectTripPoiImages(placeMetadatas: unknown[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const metadata of placeMetadatas) {
    for (const url of collectPlaceImages(metadata)) {
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

/** Java-style string hash — matches frontend trip-cover.util.ts. */
export function hashTripId(tripId: string): number {
  let h = 0;
  for (let i = 0; i < tripId.length; i++) {
    h = (h * 31 + tripId.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function pickCoverImageByTripId(tripId: string, images: string[]): string | null {
  if (images.length === 0) return null;
  return images[hashTripId(tripId) % images.length] ?? null;
}

export function resolveTripCoverImageUrl(
  tripId: string,
  metadata: unknown,
  poiImages: string[],
  countryCoverImageUrl?: string | null,
): string | null {
  const source = readCoverImageSource(metadata);
  const explicitUrl = readExplicitCoverImageUrl(metadata);

  if ((source === 'poi' || source === 'user') && explicitUrl) {
    return explicitUrl;
  }

  const fromPoi = pickCoverImageByTripId(tripId, poiImages);
  if (fromPoi) return fromPoi;

  if (typeof countryCoverImageUrl === 'string' && countryCoverImageUrl.trim().length > 0) {
    return countryCoverImageUrl.trim();
  }

  return null;
}
