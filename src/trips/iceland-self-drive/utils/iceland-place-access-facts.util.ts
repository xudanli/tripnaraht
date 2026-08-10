/**
 * Catalog-backed road/access facts for Independent VERIFY (not generator scores).
 * Known Iceland place requirements used when snapshot lacks explicit roadRequirements.
 */

export interface PlaceAccessFacts {
  requiresFroad?: boolean;
  requires4wd?: boolean;
  riverCrossingRisk?: boolean;
  packId?: string;
  subregionId?: string;
}

/** PlaceId → access facts (from Golden Set modeling) */
export const ICELAND_PLACE_ACCESS_FACTS: Record<number, PlaceAccessFacts> = {
  // Highlands / F-road
  381108: {
    requiresFroad: true,
    requires4wd: true,
    packId: 'highlands',
    subregionId: 'highlands_south_landmannalaugar',
  },
  381109: {
    requiresFroad: true,
    requires4wd: true,
    // River access is guided-experience only (exp_thorsmork_superjeep); not self-drive hard gate
    packId: 'highlands',
    subregionId: 'highlands_south_thorsmork',
  },
  381110: {
    requiresFroad: true,
    requires4wd: true,
    packId: 'highlands',
    subregionId: 'highlands_north_askja',
  },
};

export function resolvePlaceAccessFacts(
  placeId: number | undefined,
  explicit?: PlaceAccessFacts,
): PlaceAccessFacts {
  if (!placeId) return explicit ?? {};
  const known = ICELAND_PLACE_ACCESS_FACTS[placeId] ?? {};
  return { ...known, ...explicit };
}
