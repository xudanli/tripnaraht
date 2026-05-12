/**
 * World Freshness Vector — multi-dimensional world drift (not a single monolithic version).
 * Used for dependency-aware replay invalidation vs giant hammer invalidation.
 *
 * Each dimension can evolve independently; align with Cognitive Dependency Graph / selective recomputation.
 */

export interface WorldFreshnessVector {
  inventoryVersion?: string;
  weatherVersion?: string;
  trafficVersion?: string;
  pricingVersion?: string;
  policyVersion?: string;
  mapVersion?: string;
}
