/**
 * Expand Place ID normalization — place:is:* / place:db:* / numeric DB ids.
 * Canonical Place SSOT remains CPRE `{cc}.{slug}` (not place:is: as primary).
 */

const PLACE_ID_RE = /^[a-z]{2}\.[a-z0-9_]+$/i;
const POI_LEGACY_RE = /^poi_[a-z0-9_]+$/i;
const PLACE_IS_PREFIX_RE = /^place:is:([a-z0-9_]+)$/i;
const PLACE_DB_RE = /^place:db:(\d+)$/i;

export function isPlaceCanonicalId(id: string): boolean {
  return PLACE_ID_RE.test(id.trim());
}

/** Extract numeric Place.id from place:db:123 or bare digits */
export function parsePlaceDbId(raw: string): string | null {
  const t = raw.trim();
  const m = PLACE_DB_RE.exec(t);
  if (m) return m[1]!;
  if (/^\d{4,}$/.test(t)) return t;
  return null;
}

/**
 * Normalize to CPRE-shaped place id when possible.
 * place:db:* returns null here — resolve via Identity sourceRefs (system=place_db).
 */
export function normalizePlaceId(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const placeIs = PLACE_IS_PREFIX_RE.exec(t);
  if (placeIs) return `is.${placeIs[1]!.toLowerCase()}`;

  if (PLACE_DB_RE.test(t) || /^\d{4,}$/.test(t)) return null;

  if (PLACE_ID_RE.test(t)) return t.toLowerCase();
  if (POI_LEGACY_RE.test(t)) return t.toLowerCase();
  return null;
}

/** Readable alias form — never the SSOT primary key */
export function placeIsAliasForCanonical(canonicalPlaceId: string): string | null {
  if (!PLACE_ID_RE.test(canonicalPlaceId)) return null;
  const [cc, slug] = canonicalPlaceId.toLowerCase().split('.');
  if (!cc || !slug) return null;
  return `place:${cc}:${slug}`;
}
