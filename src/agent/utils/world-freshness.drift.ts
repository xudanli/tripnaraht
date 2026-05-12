import type { WorldFreshnessVector } from '../contracts/world-freshness.types';

/** Known dimensions on WorldFreshnessVector (extend when adding fields). */
export const WORLD_FRESHNESS_DIMENSION_KEYS: readonly (keyof WorldFreshnessVector)[] = [
  'inventoryVersion',
  'weatherVersion',
  'trafficVersion',
  'pricingVersion',
  'policyVersion',
  'mapVersion',
];

export type WorldFreshnessDimensionKey = (typeof WORLD_FRESHNESS_DIMENSION_KEYS)[number];

/**
 * Maps a freshness dimension to cognitive branches that should be recomputed when that dimension drifts.
 * Policy engine / incremental runtime can narrow invalidation (vs full replay hammer).
 */
export const FRESHNESS_DIMENSION_TO_COGNITIVE_DOMAINS: Record<
  WorldFreshnessDimensionKey,
  readonly string[]
> = {
  inventoryVersion: ['BOOKING_AVAILABILITY', 'ACCOMMODATION_SEARCH'],
  weatherVersion: ['OUTDOOR_ROUTE', 'TRANSPORT_TIMING'],
  trafficVersion: ['TRANSPORT_TIMING', 'ROUTE_ETA'],
  pricingVersion: ['COST_ESTIMATE', 'BUDGET_GATE'],
  policyVersion: ['COMPLIANCE_GATE', 'ENTRY_REQUIREMENTS'],
  mapVersion: ['ROUTING_GRAPH', 'POI_ROUTING'],
};

/** Dimensions where both sides have a non-empty string and values differ. */
export function driftedFreshnessDimensions(
  cached?: WorldFreshnessVector | null,
  current?: WorldFreshnessVector | null,
): WorldFreshnessDimensionKey[] {
  if (!cached || !current) return [];
  const drifted: WorldFreshnessDimensionKey[] = [];
  for (const key of WORLD_FRESHNESS_DIMENSION_KEYS) {
    const a = cached[key]?.trim();
    const b = current[key]?.trim();
    if (a && b && a !== b) drifted.push(key);
  }
  return drifted;
}

/** Union of cognitive domains affected by the given drifted dimensions (deduped, stable order). */
export function cognitiveDomainsForDriftedDimensions(
  dimensions: WorldFreshnessDimensionKey[],
): string[] {
  const set = new Set<string>();
  for (const d of dimensions) {
    const domains = FRESHNESS_DIMENSION_TO_COGNITIVE_DOMAINS[d];
    if (domains) domains.forEach((x) => set.add(x));
  }
  return [...set].sort();
}
