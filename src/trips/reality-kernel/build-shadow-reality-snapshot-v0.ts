/**
 * Shadow Reality Snapshot — dual-write sidecar from TripWorldState (does not drive decisions).
 */

import { createHash } from 'crypto';
import type { TripPlan } from '../decision/plan-model';
import type { TripWorldState } from '../decision/world-model';
import {
  REALITY_SNAPSHOT_SCHEMA_V0,
  type RealityConsistencyV0,
  type RealityDomainV0,
  type RealityLayer,
  type RealityProvenanceV0,
  type RealitySnapshotLayersV0,
  type RealitySnapshotV0,
  type SnapshotValidityV0,
} from './reality-snapshot.types';
import { getStalenessInvalidSec, getStalenessWarnSec } from './reality-staleness.policy';

const KERNEL_BUILD_ID = 'buildShadowRealitySnapshotV0';

export interface PlanTravelTimeShadowAggregateV0 {
  drive_legs: number;
  legs_with_time_ontology: number;
  degraded_world_model_legs: number;
  provenance_breakdown: Record<string, number>;
}

export interface BuildShadowRealitySnapshotOptions {
  decisionRunId?: string;
  traceRequestId?: string;
  /** When set, `travel_time` layer includes leg-level {@link TravelLeg.timeEstimate} stats */
  plan?: TripPlan;
}

export function aggregatePlanTravelTimeShadow(plan: TripPlan | undefined): PlanTravelTimeShadowAggregateV0 {
  const empty: PlanTravelTimeShadowAggregateV0 = {
    drive_legs: 0,
    legs_with_time_ontology: 0,
    degraded_world_model_legs: 0,
    provenance_breakdown: {},
  };
  if (!plan?.days?.length) return empty;

  const provenance_breakdown: Record<string, number> = {};
  let drive_legs = 0;
  let legs_with_time_ontology = 0;
  let degraded_world_model_legs = 0;

  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const leg = slot.travelLegFromPrev;
      if (!leg || leg.mode !== 'drive') continue;
      drive_legs++;
      const te = leg.timeEstimate;
      if (te) {
        legs_with_time_ontology++;
        if (te.degradedWorldModel) degraded_world_model_legs++;
        const p = te.provenance;
        provenance_breakdown[p] = (provenance_breakdown[p] ?? 0) + 1;
      }
    }
  }

  return {
    drive_legs,
    legs_with_time_ontology,
    degraded_world_model_legs,
    provenance_breakdown,
  };
}

function compactIsoForId(iso: string): string {
  return iso.replace(/[:.]/g, '-').slice(0, 24);
}

export function computeRealitySnapshotId(validAtIso: string, tripId: string | undefined, runId: string | undefined): string {
  const basis = `${validAtIso}|${tripId ?? 'no-trip'}|${runId ?? 'no-run'}`;
  const h = createHash('sha256').update(basis).digest('hex').slice(0, 12);
  return `rs_${compactIsoForId(validAtIso)}_${h}`;
}

function inferRegionLabel(destination: string): string {
  const d = destination.toUpperCase();
  if (d === 'IS' || d.includes('ICELAND')) return 'iceland';
  return destination.slice(0, 64);
}

function wrapLayer<T>(
  data: T,
  observedAt: string,
  source: string,
  confidence: number,
  degraded?: boolean,
): RealityLayer<T> {
  return {
    observed_at: observedAt,
    confidence,
    degraded,
    source,
    data,
  };
}

function maxStalenessSec(timestamps: string[], generatedAtMs: number): number {
  let max = 0;
  for (const t of timestamps) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) {
      max = Math.max(max, Math.abs(generatedAtMs - ms) / 1000);
    }
  }
  return Math.round(max);
}

/** Maps layer temporal spread + degraded flag → VALID | STALE | INVALIDATED */
export function buildSnapshotValidityV0(consistency: RealityConsistencyV0): SnapshotValidityV0 {
  const warnSec = getStalenessWarnSec();
  const invSec = getStalenessInvalidSec();
  const reasons: string[] = [];
  if (consistency.degraded) reasons.push('consistency_degraded');
  if (consistency.max_staleness_sec > invSec) {
    return {
      status: 'INVALIDATED',
      invalidation_reasons: [...reasons, 'max_staleness_sec_threshold'],
    };
  }
  if (consistency.max_staleness_sec > warnSec || consistency.degraded) {
    return {
      status: 'STALE',
      invalidation_reasons: reasons.length ? reasons : undefined,
    };
  }
  return { status: 'VALID' };
}

/**
 * Project current TripWorldState into a v0 snapshot for audit / replay / diff tooling.
 * Layers may be partial; `consistency.degraded` reflects missing or heuristic-only inputs.
 */
export function buildShadowRealitySnapshotV0(
  state: TripWorldState,
  opts: BuildShadowRealitySnapshotOptions = {},
): RealitySnapshotV0 {
  const generated_at = new Date().toISOString();
  const generatedAtMs = Date.parse(generated_at);
  const valid_at = state.signals.lastUpdatedAt ?? generated_at;

  const weatherDates = Object.keys(state.signals.weatherByDate ?? {});
  const weatherObserved =
    weatherDates.length > 0 ? valid_at : generated_at;
  const weatherLayer = wrapLayer(
    {
      dates_with_signal: weatherDates,
      count: weatherDates.length,
    },
    weatherObserved,
    'trip_world_state.signals.weatherByDate',
    weatherDates.length > 0 ? 0.72 : 0.35,
    weatherDates.length === 0,
  );

  const frames = state.signals.executionOverlayFrames ?? [];
  const legsBlocked = frames.filter((f) => Boolean((f as { road?: { blocked?: boolean } }).road?.blocked)).length;
  const roadsLayer = wrapLayer(
    {
      overlay_frame_count: frames.length,
      legs_blocked: legsBlocked,
    },
    valid_at,
    'trip_world_state.signals.executionOverlayFrames',
    frames.length > 0 ? 0.68 : 0.4,
    frames.length === 0,
  );

  const effKeys = Object.keys(state.signals.effectiveDrivableWindowByDate ?? {});
  const daylightLayer = wrapLayer(
    {
      effective_drivable_days: effKeys.length,
      daylight_feasibility_present: Boolean(state.signals.daylightFeasibility),
    },
    valid_at,
    'trip_world_state.signals.daylight/effectiveDrivableWindow',
    effKeys.length > 0 || state.signals.daylightFeasibility ? 0.7 : 0.45,
    effKeys.length === 0 && !state.signals.daylightFeasibility,
  );

  let inventoryWithSupply = 0;
  let hotelCandidates = 0;
  let totalCandidates = 0;
  for (const date of Object.keys(state.candidatesByDate ?? {})) {
    const list = state.candidatesByDate[date] ?? [];
    for (const c of list) {
      totalCandidates++;
      if (c.type === 'hotel') hotelCandidates++;
      if (c.supplySnapshot) inventoryWithSupply++;
    }
  }
  const inventoryLayer = wrapLayer(
    {
      total_candidates: totalCandidates,
      hotel_candidates: hotelCandidates,
      with_supply_snapshot: inventoryWithSupply,
    },
    valid_at,
    'trip_world_state.candidatesByDate.supplySnapshot',
    inventoryWithSupply > 0 ? 0.65 : 0.42,
    hotelCandidates > 0 && inventoryWithSupply === 0,
  );

  const tmKeys = Object.keys(state.travelMatrix ?? {});
  const inventoryDates = Object.keys(state.candidatesByDate ?? {}).length;
  const planTravel = aggregatePlanTravelTimeShadow(opts.plan);
  /** Drive legs missing Travel Time ontology, or no matrix cache when no drive legs sampled */
  const travelTimeDegraded =
    planTravel.drive_legs > 0
      ? planTravel.legs_with_time_ontology < planTravel.drive_legs
      : tmKeys.length === 0;
  const travelTimeConfidence = (() => {
    let c = tmKeys.length > 0 ? 0.62 : 0.48;
    if (planTravel.drive_legs > 0) {
      const ratio = planTravel.legs_with_time_ontology / planTravel.drive_legs;
      c = Math.min(0.88, c + 0.12 * ratio);
    }
    return c;
  })();
  const travelTimeLayer = wrapLayer(
    {
      travel_matrix_edges: tmKeys.length,
      candidate_dates: inventoryDates,
      plan_travel_time: planTravel,
    },
    valid_at,
    'trip_world_state.travelMatrix+candidates+plan.travelLeg.timeEstimate',
    travelTimeConfidence,
    travelTimeDegraded,
  );

  const physicsKeys = Object.keys(state.signals.unifiedPhysicsFieldByLegId ?? {});
  const hazardsLayer = wrapLayer(
    {
      unified_physics_legs: physicsKeys.length,
      fuel_legs: Object.keys(state.signals.fuelReachabilityByLegId ?? {}).length,
    },
    valid_at,
    'trip_world_state.signals.physics+fuel',
    physicsKeys.length > 0 ? 0.7 : 0.45,
    physicsKeys.length === 0,
  );

  const failuresLayer = wrapLayer(
    { note: 'failure events attach via OPS outcome / Failure Graph; empty in-engine shadow' },
    generated_at,
    'placeholder',
    0.25,
    true,
  );

  const layers: RealitySnapshotLayersV0 = {
    weather: weatherLayer,
    roads: roadsLayer,
    daylight: daylightLayer,
    inventory: inventoryLayer,
    travel_time: travelTimeLayer,
    hazards: hazardsLayer,
    failures: failuresLayer,
  };

  const observedTimes: string[] = [
    weatherLayer.observed_at,
    roadsLayer.observed_at,
    daylightLayer.observed_at,
    inventoryLayer.observed_at,
    travelTimeLayer.observed_at,
    hazardsLayer.observed_at,
    failuresLayer.observed_at,
  ];

  const anyDegraded = Object.values(layers).some((l) => l?.degraded);
  const consistency: RealityConsistencyV0 = {
    max_staleness_sec: maxStalenessSec(observedTimes, generatedAtMs),
    degraded: Boolean(anyDegraded),
  };

  const domain: RealityDomainV0 = {
    region: inferRegionLabel(state.context.destination),
  };

  const provenance: RealityProvenanceV0 = {
    generated_by: KERNEL_BUILD_ID,
    source_versions: {
      schema: REALITY_SNAPSHOT_SCHEMA_V0,
      reality_kernel: '0.1.0',
      shadow_mode: '1',
      ...(opts.traceRequestId ? { trace_request_id: opts.traceRequestId } : {}),
      ...(opts.decisionRunId ? { decision_run_id: opts.decisionRunId } : {}),
    },
  };

  const snapshot_id = computeRealitySnapshotId(valid_at, state.context.tripId, opts.decisionRunId);
  const validity = buildSnapshotValidityV0(consistency);

  return {
    schema: REALITY_SNAPSHOT_SCHEMA_V0,
    snapshot_id,
    valid_at,
    generated_at,
    domain,
    layers,
    consistency,
    validity,
    provenance,
  };
}
