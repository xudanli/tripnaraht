/**
 * Project structured trip signals → icelandSelfDriveRouteFacts (planner upstream write).
 * No free-text / JSON.stringify keyword scraping.
 */

import { isIcelandDestination } from '../../../../trips/causal-runtime/domains/trip-world-state-iceland-causal.util';
import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import type { WorldConstraintStoreSnapshot } from '../../../../world/world-snapshot';
import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../road/road-segment-profile.loader';
import type { IcelandRoadLiveStatus } from '../road-weather/iceland-road-weather.types';
import type { IcelandSelfDriveRouteFacts } from './iceland-self-drive-route-facts.types';
import { mapVehicleClassExact } from './resolve-iceland-self-drive-facts';
import { enrichRouteFactsWithDaylightDriving } from './enrich-iceland-route-facts-daylight';

export interface IcelandRouteFactsPlannerMeta {
  fRoadIds?: string[];
  hasFRoad?: boolean;
  hasGravel?: boolean;
  highWindExposure?: boolean;
  /** false → NO_F_ROAD rental restriction */
  fRoadAllowed?: unknown;
  vehicleType?: string;
  routeDecisionFlags?: Record<string, unknown>;
  rentalRestrictions?: string[];
}

function uniq(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mapWorldRoadState(state: string): IcelandRoadLiveStatus {
  const u = state.toUpperCase();
  if (u === 'CLOSED') return 'CLOSED';
  if (u === 'RESTRICTED' || u === 'DEGRADED') return 'LIMITED';
  if (u === 'OPEN') return 'OPEN';
  return 'UNKNOWN';
}

function collectRoadIdsFromWorld(
  snapshot: WorldConstraintStoreSnapshot | undefined,
): { ids: string[]; statusById: Partial<Record<string, IcelandRoadLiveStatus>> } {
  if (!snapshot?.roads) return { ids: [], statusById: {} };
  const ids: string[] = [];
  const statusById: Partial<Record<string, IcelandRoadLiveStatus>> = {};
  for (const [id, field] of Object.entries(snapshot.roads)) {
    const roadId = (field?.id || id).trim();
    if (!roadId) continue;
    ids.push(roadId);
    if (field?.state) {
      statusById[roadId] = mapWorldRoadState(field.state);
    }
  }
  return { ids, statusById };
}

function collectFlagsFromOverlay(state: TripWorldState): {
  hasFRoad: boolean;
  hasGravel: boolean;
  blocked: boolean;
} {
  let hasFRoad = false;
  let hasGravel = false;
  let blocked = false;
  for (const frame of state.signals.executionOverlayFrames ?? []) {
    if (frame.road?.fRoadConstraint) hasFRoad = true;
    if (frame.road?.blocked) blocked = true;
    if (frame.route?.roadAccessibility?.fRoad) hasFRoad = true;
    if (frame.route?.roadAccessibility?.requires4WD) hasFRoad = true;
  }
  return { hasFRoad, hasGravel, blocked };
}

function collectFlagsFromPlanOverlays(plan: TripPlan | undefined): {
  hasFRoad: boolean;
  hasGravel: boolean;
} {
  let hasFRoad = false;
  let hasGravel = false;
  if (!plan) return { hasFRoad, hasGravel };
  for (const day of plan.days) {
    for (const slot of day.timeSlots) {
      const overlay = slot.routeExecutionOverlay as
        | {
            roadAccessibility?: { fRoad?: boolean; gravelRoad?: boolean };
            assessment?: { roadAccessibility?: { fRoad?: boolean } };
          }
        | undefined;
      if (
        overlay?.roadAccessibility?.fRoad === true ||
        overlay?.assessment?.roadAccessibility?.fRoad === true
      ) {
        hasFRoad = true;
      }
      if (overlay?.roadAccessibility?.gravelRoad === true) {
        hasGravel = true;
      }
    }
  }
  return { hasFRoad, hasGravel };
}

function readPolicyBag(
  state: TripWorldState,
): IcelandRouteFactsPlannerMeta {
  const policies = state.policies as Record<string, unknown> | undefined;
  if (!policies) return {};
  const routeDecisionFlags =
    (policies.routeDecisionFlags as Record<string, unknown> | undefined) ?? undefined;
  const fRoadIds = Array.isArray(policies.fRoadIds)
    ? (policies.fRoadIds as unknown[]).map(String)
    : Array.isArray(routeDecisionFlags?.fRoadIds)
      ? (routeDecisionFlags!.fRoadIds as unknown[]).map(String)
      : undefined;
  const rentalRestrictions = Array.isArray(policies.rentalRestrictions)
    ? (policies.rentalRestrictions as unknown[]).map(String)
    : undefined;
  return {
    fRoadIds,
    hasFRoad:
      policies.hasFRoad === true ||
      routeDecisionFlags?.hasFRoad === true ||
      (fRoadIds != null && fRoadIds.length > 0),
    hasGravel:
      policies.hasGravel === true || routeDecisionFlags?.hasGravel === true,
    highWindExposure:
      policies.highWindExposure === true ||
      routeDecisionFlags?.highWind === true ||
      routeDecisionFlags?.highWindExposure === true,
    fRoadAllowed: policies.fRoadAllowed ?? routeDecisionFlags?.fRoadAllowed,
    vehicleType:
      typeof policies.vehicleType === 'string'
        ? policies.vehicleType
        : undefined,
    routeDecisionFlags,
    rentalRestrictions,
  };
}

function enrichFlagsFromPackProfiles(
  roadSegmentIds: string[],
): { hasFRoad: boolean; hasGravel: boolean } {
  const bundle = loadRoadSegmentProfilesForCountry('IS');
  let hasFRoad = false;
  let hasGravel = false;
  if (!bundle) return { hasFRoad, hasGravel };
  for (const id of roadSegmentIds) {
    const profile = resolveRoadSegmentProfile(id, bundle);
    if (!profile) continue;
    if (profile.roadClass === 'HIGHLAND_F_ROAD' || profile.roadClass === 'TRACK') {
      hasFRoad = true;
    }
    if (
      profile.surfaceType === 'GRAVEL' ||
      profile.surfaceType === 'UNPAVED' ||
      profile.surfaceType === 'MIXED'
    ) {
      hasGravel = true;
    }
  }
  return { hasFRoad, hasGravel };
}

/**
 * Build route facts from structured world / overlay / policy / planner meta.
 */
export function buildIcelandSelfDriveRouteFactsFromTripState(opts: {
  state: TripWorldState;
  plan?: TripPlan;
  plannerMeta?: IcelandRouteFactsPlannerMeta;
}): IcelandSelfDriveRouteFacts | undefined {
  const { state, plan, plannerMeta } = opts;
  if (!isIcelandDestination(state.context.destination)) return undefined;

  const existing = state.signals.icelandSelfDriveRouteFacts;
  const policyBag = readPolicyBag(state);
  const meta: IcelandRouteFactsPlannerMeta = {
    ...policyBag,
    ...plannerMeta,
    routeDecisionFlags: {
      ...policyBag.routeDecisionFlags,
      ...plannerMeta?.routeDecisionFlags,
    },
    fRoadIds: uniq([
      ...(policyBag.fRoadIds ?? []),
      ...(plannerMeta?.fRoadIds ?? []),
    ]),
    rentalRestrictions: uniq([
      ...(policyBag.rentalRestrictions ?? []),
      ...(plannerMeta?.rentalRestrictions ?? []),
      ...(existing?.rentalRestrictions ?? []),
    ]),
  };

  const world = collectRoadIdsFromWorld(
    state.signals.executionSemanticView?.world?.constraints,
  );
  const overlay = collectFlagsFromOverlay(state);
  const planOverlay = collectFlagsFromPlanOverlays(plan);

  const roadSegmentIds = uniq([
    ...(existing?.roadSegmentIds ?? []),
    ...(meta.fRoadIds ?? []),
    ...world.ids,
  ]);

  const packFlags = enrichFlagsFromPackProfiles(roadSegmentIds);

  const hasFRoad =
    existing?.routeFlags?.hasFRoad === true ||
    meta.hasFRoad === true ||
    overlay.hasFRoad ||
    planOverlay.hasFRoad ||
    packFlags.hasFRoad ||
    roadSegmentIds.some((id) => /^F\d+/i.test(id));

  const hasGravel =
    existing?.routeFlags?.hasGravel === true ||
    meta.hasGravel === true ||
    overlay.hasGravel ||
    planOverlay.hasGravel ||
    packFlags.hasGravel;

  const highWindExposure =
    existing?.routeFlags?.highWindExposure === true ||
    meta.highWindExposure === true;

  const rentalRestrictions = [...(meta.rentalRestrictions ?? [])];
  if (meta.fRoadAllowed === false && !rentalRestrictions.includes('NO_F_ROAD')) {
    rentalRestrictions.push('NO_F_ROAD');
  }

  const roadStatusBySegmentId: Partial<Record<string, IcelandRoadLiveStatus>> = {
    ...world.statusById,
    ...existing?.roadStatusBySegmentId,
  };
  if (overlay.blocked && roadSegmentIds[0]) {
    roadStatusBySegmentId[roadSegmentIds[0]] =
      roadStatusBySegmentId[roadSegmentIds[0]] ?? 'CLOSED';
  }

  const vehicleClass =
    existing?.vehicleClass ??
    mapVehicleClassExact(
      meta.vehicleType ??
        state.policies?.vehicleClass ??
        state.policies?.vehicleProfile?.vehicleClass,
    );

  // Default ring when no highland signal — explicit paved baseline
  let idsOut =
    roadSegmentIds.length > 0
      ? roadSegmentIds
      : hasFRoad
        ? [] // try pack HIGHLAND_F_ROAD below
        : ['RING_ROAD'];

  // hasFRoad but no concrete ids → pin first pack highland id (plow / live road status need it)
  if (hasFRoad && idsOut.length === 0) {
    const highland = loadRoadSegmentProfilesForCountry('IS')?.profiles.find(
      (p) => p.roadClass === 'HIGHLAND_F_ROAD',
    );
    if (highland?.roadId) {
      idsOut = [highland.roadId];
    }
  }

  const base: IcelandSelfDriveRouteFacts = {
    schemaId: 'tripnara.iceland.self_drive_route_facts@v1',
    roadSegmentIds: idsOut.length > 0 ? idsOut : undefined,
    roadStatusBySegmentId:
      Object.keys(roadStatusBySegmentId).length > 0 ? roadStatusBySegmentId : undefined,
    seasonOpenBySegmentId: existing?.seasonOpenBySegmentId,
    rentalRestrictions: rentalRestrictions.length > 0 ? rentalRestrictions : undefined,
    vehicleClass,
    driverExperience: existing?.driverExperience,
    segmentLengthKm: existing?.segmentLengthKm,
    isNight: existing?.isNight,
    daylightDriving: existing?.daylightDriving,
    winter: existing?.winter,
    routeFlags: {
      hasFRoad: hasFRoad || undefined,
      hasGravel: hasGravel || undefined,
      highWindExposure: highWindExposure || undefined,
    },
  };

  return enrichRouteFactsWithDaylightDriving({
    facts: base,
    plan,
    fallbackDate: state.context.startDate,
  });
}

export function attachIcelandSelfDriveRouteFactsToState(opts: {
  state: TripWorldState;
  plan?: TripPlan;
  plannerMeta?: IcelandRouteFactsPlannerMeta;
}): IcelandSelfDriveRouteFacts | undefined {
  const facts = buildIcelandSelfDriveRouteFactsFromTripState(opts);
  if (facts) {
    opts.state.signals.icelandSelfDriveRouteFacts = facts;
  } else {
    delete opts.state.signals.icelandSelfDriveRouteFacts;
  }
  return facts;
}
