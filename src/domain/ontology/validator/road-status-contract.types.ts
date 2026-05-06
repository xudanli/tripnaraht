/**
 * Canonical JSON shape for SpatialDomainSegment.latest_status (Road.is / mock sync).
 * Consumed by SegmentFeasibilityUtil + PhysicalValidator; written by EnvSyncWorker.
 */

export const ROAD_SURFACE_CONDITIONS = ['OPEN', 'CLOSED', 'SLIPPERY', 'HEAVY_SNOW', 'UNKNOWN'] as const;

export type RoadSurfaceCondition = (typeof ROAD_SURFACE_CONDITIONS)[number];

/** Persisted column latest_status + provider.fetchCondition return value (subset). */
export interface SegmentLatestRoadStatusV1 {
  condition: RoadSurfaceCondition;
  /** Human-readable status from road.is or mock */
  condition_text?: string;
  evidence_source?: string;
  source_url?: string;
  /** ISO time when upstream reported the condition */
  observed_at?: string;
  /** ISO time when we wrote this row */
  synced_at?: string;
  provider?: 'road.is' | 'mock';
  /** Optional raw vendor payload for audits */
  raw?: unknown;
}

export function parseRoadSurfaceCondition(value: unknown): RoadSurfaceCondition {
  const u = String(value ?? '')
    .trim()
    .toUpperCase();
  if (u === 'OPEN') return 'OPEN';
  if (u === 'CLOSED') return 'CLOSED';
  if (u === 'SLIPPERY') return 'SLIPPERY';
  if (u === 'HEAVY_SNOW' || u === 'HEAVY SNOW') return 'HEAVY_SNOW';
  return 'UNKNOWN';
}

/** True when live road data should BLOCK traversal (union with static seasonal rules). */
export function roadSurfaceConditionIsBlocking(c: RoadSurfaceCondition): boolean {
  return c === 'CLOSED' || c === 'HEAVY_SNOW';
}
