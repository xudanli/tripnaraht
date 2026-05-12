/**
 * When plans omit `travelLegFromPrev` (common for dense urban / walking days),
 * `buildExecutionOverlay` produces no frame for those slots — DAG nodes disappear and ECO cannot close.
 * This pass adds minimal EXECUTABLE pedestrian stubs so execution truth + Neptune/ECO can still run.
 *
 * Use {@link AugmentPedestrianOptions.persistSyntheticTravelLegsOnPlan} to mirror stubs onto `travelLegFromPrev`
 * (non-destructive; skips first slot of each day).
 */

import type { TripPlan, PlanSlot } from '../decision/plan-model';
import type { GeoPoint, TravelLeg } from '../decision/world-model';
import type { RouteExecutionAssessment } from '../routing/execution/route-execution-assessment.types';
import type { ExecutionOverlayFrame } from './execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from './execution-overlay-frame.types';

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(sin)));
}

function defaultRouteAssessment(legId: string, leg: TravelLeg): RouteExecutionAssessment {
  return {
    legId,
    terrainDifficulty: 'LOW',
    weatherExposure: {},
    roadAccessibility: { fRoad: false },
    executionReliability: typeof leg.reliability === 'number' ? leg.reliability : 0.85,
    estimatedDelayFactor: 1,
    executionState: 'EXECUTABLE',
  };
}

/** ~12 min / km walking + floor for UX stability */
function walkingMinutesForLeg(km: number): number {
  if (!Number.isFinite(km) || km <= 0) {
    return 2;
  }
  return Math.max(2, Math.round(km * 12));
}

function buildSyntheticInboundLeg(prev: PlanSlot | undefined, slot: PlanSlot): TravelLeg {
  if (!prev) {
    const p = slot.coordinates ?? { lat: 0, lng: 0 };
    return {
      mode: 'walk',
      from: p,
      to: p,
      durationMin: 0,
      source: 'eco_pedestrian_stub',
    };
  }
  const from = prev.coordinates ?? { lat: 0, lng: 0 };
  const to = slot.coordinates ?? from;
  const km = haversineKm(from, to);
  const durationMin = walkingMinutesForLeg(km);
  return {
    mode: 'walk',
    from,
    to,
    durationMin,
    distanceKm: km > 0.001 ? Math.round(km * 1000) / 1000 : undefined,
    source: 'eco_pedestrian_stub',
  };
}

function syntheticOverlayFrame(slotId: string, leg: TravelLeg): ExecutionOverlayFrame {
  const route = defaultRouteAssessment(slotId, leg);
  const unifiedDelayMinutes = Math.max(0, Math.round(leg.durationMin));
  const reliabilityScore = Math.max(0.15, Math.min(1, route.executionReliability));

  return {
    schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
    legId: slotId,
    route,
    temporal: {
      driftMinutes: 0,
      crossDayRisk: 0,
      daylightViolation: false,
      unifiedDelayMinutes,
    },
    weather: {
      severity: 'LOW',
      delayFactor: 1,
    },
    road: {
      blocked: false,
      fRoadConstraint: false,
    },
    repair: {
      recommended: false,
      type: 'PEDESTRIAN_STUB',
    },
    finalExecutionState: 'EXECUTABLE',
    unifiedDelayMinutes,
    reliabilityScore,
    annotations: {
      legacyFusionExecutionState: 'EXECUTABLE',
    },
  };
}

export interface AugmentPedestrianOptions {
  /**
   * When true, assigns {@link PlanSlot.travelLegFromPrev} from the same synthetic inbound leg used for the stub frame,
   * only if still absent and there is a previous slot on that day (first slot of day stays unset — no inbound corridor).
   * Does not overwrite planner-provided legs.
   */
  persistSyntheticTravelLegsOnPlan?: boolean;
}

/**
 * For each plan slot that has no overlay frame yet, append a minimal pedestrian stub frame (`legId === slot.id`).
 * Existing frames (driving / weather pipeline) are preserved.
 */
export function augmentOverlayFramesWithPedestrianGaps(
  plan: TripPlan,
  frames: ExecutionOverlayFrame[],
  options?: AugmentPedestrianOptions,
): ExecutionOverlayFrame[] {
  const persistLegs = options?.persistSyntheticTravelLegsOnPlan === true;
  const byLegId = new Map(frames.map(f => [f.legId, f] as const));
  const extra: ExecutionOverlayFrame[] = [];

  for (const day of plan.days) {
    let prev: PlanSlot | undefined;
    for (const slot of day.timeSlots) {
      if (byLegId.has(slot.id)) {
        prev = slot;
        continue;
      }
      const leg = buildSyntheticInboundLeg(prev, slot);
      if (persistLegs && prev && !slot.travelLegFromPrev) {
        slot.travelLegFromPrev = leg;
      }
      const frame = syntheticOverlayFrame(slot.id, leg);
      extra.push(frame);
      byLegId.set(slot.id, frame);
      prev = slot;
    }
  }

  return extra.length ? [...frames, ...extra] : frames;
}
