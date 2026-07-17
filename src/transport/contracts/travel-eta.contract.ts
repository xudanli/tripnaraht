/**
 * Travel ETA contract — L1 base / L2 planning / provenance + geometry.
 *
 * Frozen after travel-info audit (2026-07):
 * - Do NOT overwrite provider ETA; always keep baseDurationMin.
 * - planningDurationMin is what scheduling / feasibility consume.
 * - geometry is required for DEM profile; may be null until L1 wired.
 *
 * Schema id for API / PlanVersion stamping.
 */

export const TRAVEL_ETA_CONTRACT_SCHEMA = 'tripnara/travel-eta/v1' as const;

/** L1 route providers (and heuristic when no route). */
export type TravelEtaRouteProvider =
  | 'MAPBOX'
  | 'GOOGLE'
  | 'AMAP'
  | 'OSRM'
  | 'GRAPHHOPPER'
  | 'HEURISTIC'
  | 'MANUAL'
  | 'UNKNOWN';

/** How the duration number was produced (finer than provider when nested). */
export type TravelEtaSourceKind =
  | 'ROUTE_API'
  | 'HEURISTIC'
  | 'ICELAND_COORDINATE_HEURISTIC'
  | 'CACHED'
  | 'MANUAL';

/**
 * Why planningDuration differs from baseDuration.
 * Only append codes that actually changed the number (honesty bit).
 */
export type TravelEtaAdjustmentReason =
  | 'F_ROAD'
  | 'UNPAVED_ROAD'
  | 'GRAVEL_UNCERTAINTY'
  | 'SEASONAL_UNCERTAINTY'
  | 'ROAD_STATUS'
  | 'WEATHER'
  | 'STEEP_TERRAIN'
  | 'TERRAIN_COMPLEXITY'
  | 'VEHICLE_MISMATCH_BUFFER'
  | 'PARKING_WALK_BUFFER'
  | 'PICKUP_BUFFER'
  | 'SAFETY_BUFFER'
  | 'PEAK_HOUR'
  | 'DATA_UNCERTAINTY'
  | 'PARKING_BUFFER';

export type TravelEtaAuthority = 'SHADOW' | 'AUTHORITATIVE';

export type TravelEtaSchedulability = 'SCHEDULABLE' | 'BLOCKED' | 'UNKNOWN';

export type TerrainPolicyMode = 'AUTO' | 'REQUIRED' | 'SKIP';

export type TravelEtaProviderTraceStatus = 'CONFIRMED' | 'UNKNOWN';

export interface TravelEtaAdjustmentV1 {
  type: TravelEtaAdjustmentReason;
  durationDeltaMin: number;
  evidenceRef?: string;
}

export type TravelGeometryEncoding = 'ENCODED_POLYLINE' | 'GEOJSON_LINESTRING' | 'NONE';

/**
 * L1 geometry — DEM profile and F-road spatial match consume this.
 * Absent geometry ⇒ DEM may only do point elevation, not route profile.
 */
export interface TravelRouteGeometryV1 {
  encoding: TravelGeometryEncoding;
  /** Encoded polyline (Google/Mapbox) or GeoJSON string when encoding ≠ NONE */
  value?: string;
  /** Coordinate count if known (audit / sample planning) */
  pointCount?: number;
  /** Where geometry came from */
  source: 'ROUTE_API' | 'CACHED_METADATA' | 'STRAIGHT_LINE' | 'NONE';
}

/**
 * DEM Gate 2 summary — attach via TravelSegmentEnrichmentService (terrainPolicy AUTO/REQUIRED).
 * Does not rewrite baseDuration; consumers use for fatigue / F-road buffers.
 */
export interface TravelSegmentTerrainV1 {
  ascentM: number;
  descentM: number;
  avgSlopePct: number;
  maxSlopePct: number;
  sampleCount: number;
  demSource: string;
  resolutionM?: number;
  srid?: number;
  confidence: number;
  geometrySource: TravelRouteGeometryV1['source'];
}

/**
 * Provenance — every ETA must explain itself.
 */
export interface TravelEtaProvenanceV1 {
  provider: TravelEtaRouteProvider;
  sourceKind: TravelEtaSourceKind;
  calculatedAt: string; // ISO-8601
  cacheHit: boolean;
  /** 0–1; HEURISTIC / global-DEM-era buffers should be lower */
  confidence: number;
  /** Optional Directions request id when provider returns one */
  providerRequestId?: string;
  routeProfile?: 'DRIVING' | 'WALKING' | 'TRANSIT';
  fallbackUsed?: boolean;
  fallbackReason?: string;
}

/**
 * Core three-field envelope (user-facing planning contract).
 *
 * - baseDurationMin: provider / L1 raw
 * - planningDurationMin: L2 used for schedule (base + buffers)
 * - uncertaintyMin: extra slack for UI / NEED_CONFIRM bands (may equal planning − base)
 */
export interface TravelEtaEnvelopeV1 {
  schema: typeof TRAVEL_ETA_CONTRACT_SCHEMA;
  /** L1 — never overwrite with Iceland buffers */
  baseDurationMin: number;
  /**
   * L2 planning estimate (base + adjustments). Always computed when L2 runs.
   * Schedule consumers must use {@link schedulableDurationMin} under SHADOW.
   */
  planningDurationMin: number;
  /**
   * What schedule / feasibility / travel-info.duration should use.
   * SHADOW → equals base; AUTHORITATIVE → equals planning; BLOCKED → equals base (do not schedule on closed roads).
   */
  schedulableDurationMin: number;
  /** Soft band above planning for “maybe longer” UX */
  uncertaintyMin: number;
  confidence: number;
  /** @deprecated prefer adjustments[].type — kept for FE compat */
  adjustmentReasons: TravelEtaAdjustmentReason[];
  /** Structured L2 deltas (authoritative writer only) */
  adjustments?: TravelEtaAdjustmentV1[];
  provenance: TravelEtaProvenanceV1;
  providerTraceStatus?: TravelEtaProviderTraceStatus;
  /** SHADOW = record L2 but schedule on base; AUTHORITATIVE = schedule on planning */
  authority?: TravelEtaAuthority;
  /** When SHADOW, mirrors planningDurationMin for dashboards */
  shadowPlanningDurationMin?: number;
  schedulability?: TravelEtaSchedulability;
  /** Gate reasons that block scheduling (2WD, CLOSED, DEM missing) — not time deltas */
  gateReasons?: string[];
  distanceM?: number;
  geometry?: TravelRouteGeometryV1 | null;
  terrain?: TravelSegmentTerrainV1;
}

/**
 * travel-info segment — additive fields on existing shape.
 * Legacy `duration` remains for FE compat; when eta present, duration SHOULD equal schedulableDurationMin.
 */
export interface TravelInfoSegmentEtaFieldsV1 {
  /**
   * @deprecated Prefer eta.schedulableDurationMin. Kept equal to schedulable when eta is present.
   */
  duration: number | null;
  distance: number | null;
  travelMode: string | null;
  /** Additive — absent until L1/L2 wired */
  eta?: TravelEtaEnvelopeV1;
}

export interface TravelInfoSegmentV1 extends TravelInfoSegmentEtaFieldsV1 {
  fromItemId: string;
  toItemId: string;
  fromPlace: string;
  toPlace: string;
  crossDay?: boolean;
}

/** Optional persistence under ItineraryItem.metadata.travelEta (no Prisma migration required for MVP). */
export const ITINERARY_ITEM_TRAVEL_ETA_METADATA_KEY = 'travelEta' as const;

export interface ItineraryItemTravelEtaMetadataV1 {
  [ITINERARY_ITEM_TRAVEL_ETA_METADATA_KEY]: TravelEtaEnvelopeV1;
}

export function isTravelEtaEnvelopeV1(value: unknown): value is TravelEtaEnvelopeV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.schema === TRAVEL_ETA_CONTRACT_SCHEMA &&
    typeof o.baseDurationMin === 'number' &&
    typeof o.planningDurationMin === 'number' &&
    typeof o.uncertaintyMin === 'number' &&
    typeof o.confidence === 'number' &&
    Array.isArray(o.adjustmentReasons) &&
    typeof o.provenance === 'object' &&
    o.provenance != null
  );
}

/**
 * Compat projector: single legacy duration → envelope with base === planning (no L2 yet).
 * Use until Iceland buffers are wired; then call applyPlanningAdjustments.
 */
export function projectLegacyDurationToEtaEnvelope(input: {
  durationMin: number;
  distanceM?: number | null;
  sourceKind?: TravelEtaSourceKind;
  provider?: TravelEtaRouteProvider;
  cacheHit?: boolean;
  calculatedAt?: string;
  confidence?: number;
  geometry?: TravelRouteGeometryV1 | null;
  providerRequestId?: string;
  routeProfile?: TravelEtaProvenanceV1['routeProfile'];
  fallbackUsed?: boolean;
  fallbackReason?: string;
}): TravelEtaEnvelopeV1 {
  const durationMin = Math.max(1, Math.round(input.durationMin));
  const sourceKind = input.sourceKind ?? 'HEURISTIC';
  const provider =
    input.provider ??
    (sourceKind === 'ROUTE_API' ? 'UNKNOWN' : sourceKind === 'MANUAL' ? 'MANUAL' : 'HEURISTIC');
  const confidence =
    input.confidence ??
    (sourceKind === 'ROUTE_API'
      ? provider === 'UNKNOWN'
        ? 0.55
        : 0.85
      : sourceKind === 'ICELAND_COORDINATE_HEURISTIC'
        ? 0.7
        : 0.55);

  return {
    schema: TRAVEL_ETA_CONTRACT_SCHEMA,
    baseDurationMin: durationMin,
    planningDurationMin: durationMin,
    schedulableDurationMin: durationMin,
    uncertaintyMin: 0,
    confidence,
    adjustmentReasons: [],
    adjustments: [],
    provenance: {
      provider,
      sourceKind,
      calculatedAt: input.calculatedAt ?? new Date().toISOString(),
      cacheHit: input.cacheHit ?? false,
      confidence,
      providerRequestId: input.providerRequestId,
      routeProfile: input.routeProfile,
      fallbackUsed: input.fallbackUsed,
      fallbackReason: input.fallbackReason,
    },
    providerTraceStatus: provider === 'UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED',
    authority: 'SHADOW',
    schedulability: 'SCHEDULABLE',
    gateReasons: [],
    distanceM: input.distanceM != null ? Math.max(0, Math.round(input.distanceM)) : undefined,
    geometry: input.geometry ?? null,
  };
}

/**
 * Apply L2 buffers without mutating baseDurationMin.
 * Sets planningDurationMin + shadow fields; schedulableDurationMin depends on authority.
 */
export function applyPlanningAdjustments(
  base: TravelEtaEnvelopeV1,
  adjustments: Array<{ reason: TravelEtaAdjustmentReason; deltaMin: number; evidenceRef?: string }>,
  opts?: {
    confidence?: number;
    uncertaintyMin?: number;
    authority?: TravelEtaAuthority;
    schedulability?: TravelEtaSchedulability;
    gateReasons?: string[];
  },
): TravelEtaEnvelopeV1 {
  const positive = adjustments.filter((a) => Number.isFinite(a.deltaMin) && a.deltaMin !== 0);
  const extra = positive.reduce((s, a) => s + Math.round(a.deltaMin), 0);
  const planningDurationMin = Math.max(1, base.baseDurationMin + extra);
  const reasons = positive.map((a) => a.reason);
  const adjustmentRows: TravelEtaAdjustmentV1[] = positive.map((a) => ({
    type: a.reason,
    durationDeltaMin: Math.round(a.deltaMin),
    evidenceRef: a.evidenceRef,
  }));
  const confidence = opts?.confidence ?? Math.min(base.confidence, reasons.length ? 0.75 : base.confidence);
  const uncertaintyMin =
    opts?.uncertaintyMin ?? Math.max(0, planningDurationMin - base.baseDurationMin);
  const authority = opts?.authority ?? base.authority ?? 'SHADOW';
  const schedulability = opts?.schedulability ?? base.schedulability ?? 'SCHEDULABLE';
  const gateReasons = opts?.gateReasons ?? base.gateReasons ?? [];
  const schedulableDurationMin =
    schedulability === 'BLOCKED'
      ? base.baseDurationMin
      : authority === 'AUTHORITATIVE'
        ? planningDurationMin
        : base.baseDurationMin;

  return {
    ...base,
    planningDurationMin,
    schedulableDurationMin,
    shadowPlanningDurationMin: authority === 'SHADOW' ? planningDurationMin : undefined,
    uncertaintyMin,
    confidence,
    adjustmentReasons: reasons,
    adjustments: adjustmentRows,
    authority,
    schedulability,
    gateReasons,
    provenance: {
      ...base.provenance,
      confidence,
    },
  };
}

/** Map PoiHopTravelSegmentResult.source → contract sourceKind (partial). */
export function mapPoiHopSourceToKind(
  source: 'route_api' | 'heuristic',
): TravelEtaSourceKind {
  return source === 'route_api' ? 'ROUTE_API' : 'HEURISTIC';
}

/**
 * Scheduling consumers: under SHADOW use schedulableDurationMin / base;
 * under AUTHORITATIVE use planningDurationMin.
 */
export function resolvePlanningDurationMin(segment: {
  duration?: number | null;
  eta?: TravelEtaEnvelopeV1;
}): number | null {
  if (segment.eta) {
    if (typeof segment.eta.schedulableDurationMin === 'number') {
      return segment.eta.schedulableDurationMin;
    }
    if (segment.eta.authority === 'AUTHORITATIVE' && Number.isFinite(segment.eta.planningDurationMin)) {
      return segment.eta.planningDurationMin;
    }
    if (Number.isFinite(segment.eta.baseDurationMin)) {
      return segment.eta.baseDurationMin;
    }
  }
  if (segment.duration != null && Number.isFinite(segment.duration)) {
    return segment.duration;
  }
  return null;
}
