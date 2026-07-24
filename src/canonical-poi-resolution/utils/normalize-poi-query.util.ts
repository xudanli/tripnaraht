/** Normalize POI query for exact / alias matching */
export function normalizePoiQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Case-insensitive equality after normalization */
export function poiQueryEquals(a: string, b: string): boolean {
  return normalizePoiQuery(a) === normalizePoiQuery(b);
}
