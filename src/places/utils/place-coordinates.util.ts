export type PlaceCoordinates = { lat: number; lng: number };

type PlaceLike = {
  id?: number;
  lat?: number | null;
  lng?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: unknown;
  location?: unknown;
  _coordinates?: { lat: number; lng: number };
  coordinates?: { lat: number; lng: number };
};

function isFiniteCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function parseCoordinatePair(coord1: number, coord2: number): PlaceCoordinates | null {
  if (!Number.isFinite(coord1) || !Number.isFinite(coord2)) return null;

  if (Math.abs(coord1) <= 90 && Math.abs(coord2) <= 180) {
    return { lat: coord1, lng: coord2 };
  }
  if (Math.abs(coord1) <= 180 && Math.abs(coord2) <= 90) {
    return { lat: coord2, lng: coord1 };
  }
  return { lat: coord1, lng: coord2 };
}

function parseLocationField(location: unknown): PlaceCoordinates | null {
  if (!location) return null;

  if (typeof location === 'string') {
    const match = location.match(/POINT\(([^)]+)\)/);
    if (match) {
      const [lng, lat] = match[1].split(/\s+/).map(parseFloat);
      if (isFiniteCoord(lat, lng)) return { lat, lng };
    }
    return null;
  }

  if (typeof location === 'object') {
    const loc = location as Record<string, unknown>;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      return parseCoordinatePair(Number(loc.coordinates[0]), Number(loc.coordinates[1]));
    }
    if (loc.lat != null && loc.lng != null) {
      const lat = Number(loc.lat);
      const lng = Number(loc.lng);
      if (isFiniteCoord(lat, lng)) return { lat, lng };
    }
  }

  return null;
}

function parseMetadataCoordinates(metadata: Record<string, unknown>): PlaceCoordinates | null {
  if (metadata.lat != null && metadata.lng != null) {
    const lat = Number(metadata.lat);
    const lng = Number(metadata.lng);
    if (isFiniteCoord(lat, lng)) return { lat, lng };
  }

  if (Array.isArray(metadata.coordinates) && metadata.coordinates.length >= 2) {
    const first = metadata.coordinates[0];
    if (typeof first === 'number') {
      const lng = Number(metadata.coordinates[0]);
      const lat = Number(metadata.coordinates[1]);
      if (isFiniteCoord(lat, lng)) return { lat, lng };
    }
    if (first && typeof first === 'object') {
      const obj = metadata.coordinates as { lat?: unknown; lng?: unknown };
      if (obj.lat != null && obj.lng != null) {
        const lat = Number(obj.lat);
        const lng = Number(obj.lng);
        if (isFiniteCoord(lat, lng)) return { lat, lng };
      }
    }
  }

  if (
    metadata.coordinates &&
    typeof metadata.coordinates === 'object' &&
    !Array.isArray(metadata.coordinates)
  ) {
    const obj = metadata.coordinates as { lat?: unknown; lng?: unknown };
    if (obj.lat != null && obj.lng != null) {
      const lat = Number(obj.lat);
      const lng = Number(obj.lng);
      if (isFiniteCoord(lat, lng)) return { lat, lng };
    }
  }

  if (metadata.location && typeof metadata.location === 'object') {
    const nested = metadata.location as Record<string, unknown>;
    if (nested.lat != null && nested.lng != null) {
      const lat = Number(nested.lat);
      const lng = Number(nested.lng);
      if (isFiniteCoord(lat, lng)) return { lat, lng };
    }
    if (Array.isArray(nested.coordinates) && nested.coordinates.length >= 2) {
      return parseCoordinatePair(Number(nested.coordinates[0]), Number(nested.coordinates[1]));
    }
  }

  return null;
}

/**
 * 与 itinerary-items 坐标 enrichment 对齐的同步解析。
 * `postgisCoords` 为批量 ST_Y/ST_X 查询结果，优先级最高。
 */
export function resolvePlaceCoordinates(
  place: PlaceLike | null | undefined,
  postgisCoords?: PlaceCoordinates | null,
): PlaceCoordinates | null {
  if (!place) return null;

  if (postgisCoords && isFiniteCoord(postgisCoords.lat, postgisCoords.lng)) {
    return postgisCoords;
  }

  if (place.coordinates?.lat != null && place.coordinates.lng != null) {
    const lat = Number(place.coordinates.lat);
    const lng = Number(place.coordinates.lng);
    if (isFiniteCoord(lat, lng)) return { lat, lng };
  }

  if (place.lat != null && place.lng != null) {
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (isFiniteCoord(lat, lng)) return { lat, lng };
  }

  if (place.latitude != null && place.longitude != null) {
    const lat = Number(place.latitude);
    const lng = Number(place.longitude);
    if (isFiniteCoord(lat, lng)) return { lat, lng };
  }

  const metadata = (place.metadata as Record<string, unknown> | undefined) ?? {};
  const fromMetadata = parseMetadataCoordinates(metadata);
  if (fromMetadata) return fromMetadata;

  const fromLocation = parseLocationField(place.location);
  if (fromLocation) return fromLocation;

  if (place._coordinates?.lat != null && place._coordinates.lng != null) {
    const lat = Number(place._coordinates.lat);
    const lng = Number(place._coordinates.lng);
    if (isFiniteCoord(lat, lng)) return { lat, lng };
  }

  return null;
}
