/**
 * Reality Kernel — canonical slice of reality (root reference for Reality OS).
 *
 * v0: spine only — temporal honesty + unified layer envelope + replay hooks.
 * Shadow mode: emitted alongside legacy paths; does not gate decisions until gradual enforcement.
 */

export const REALITY_SNAPSHOT_SCHEMA_V0 = 'tripnara/reality-snapshot/v0' as const;

/** Unified envelope: every layer follows the same governance protocol. */
export interface RealityLayer<T = unknown> {
  observed_at: string;
  /** 0–1 aggregate confidence for this layer at snapshot time */
  confidence: number;
  degraded?: boolean;
  /** Adapter / pipeline identifier (e.g. vedur.is, road.is, heuristic_v0) */
  source: string;
  data: T;
}

export interface RealityBoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface RealityDomainV0 {
  /** Logical region label */
  region: string;
  geo_scope?: RealityBoundingBox;
}

export interface RealityConsistencyV0 {
  /** Upper bound on age spread across layers (seconds); 0 if unknown */
  max_staleness_sec: number;
  /** Any layer sparse, stale, or defaulted */
  degraded: boolean;
}

export interface RealityProvenanceV0 {
  /** Builder or pipeline name */
  generated_by: string;
  /** Adapter / engine versions + audit refs */
  source_versions: Record<string, string>;
}

export interface RealitySnapshotLayersV0 {
  weather?: RealityLayer;
  roads?: RealityLayer;
  daylight?: RealityLayer;
  inventory?: RealityLayer;
  travel_time?: RealityLayer;
  hazards?: RealityLayer;
  failures?: RealityLayer;
}

/** Local truth window — world slices expire (staleness / invalidation). */
export type SnapshotValidityStatus = 'VALID' | 'STALE' | 'INVALIDATED';

export interface SnapshotValidityV0 {
  status: SnapshotValidityStatus;
  invalidation_reasons?: string[];
}

/**
 * Root object: all decisions / narratives should eventually reference `snapshot_id`.
 */
export interface RealitySnapshotV0 {
  schema: typeof REALITY_SNAPSHOT_SCHEMA_V0;
  snapshot_id: string;
  /** Decision-time world validity anchor (ISO 8601) */
  valid_at: string;
  generated_at: string;
  domain: RealityDomainV0;
  layers: RealitySnapshotLayersV0;
  consistency: RealityConsistencyV0;
  /** Time-window semantics for this slice — drives replan / BLOCKED gates */
  validity: SnapshotValidityV0;
  provenance: RealityProvenanceV0;
}
