/**
 * Evaluates world-state slice completeness from availability markers and payload shape.
 * Empty arrays without LOADED marker are treated as MISSING (not "no problems").
 */

import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type {
  CompletenessLevel,
  WorldStateCompleteness,
  WorldStateDataAvailability,
} from '../contracts/world-state-completeness';
import { auditPlanPoiIdentity } from './plan-poi-identity.util';

const ENGINE = 'completeness-evaluator';
const VERSION = '0.1.0';

export function resolveSliceCompleteness(
  marker: 'LOADED' | 'NOT_LOADED' | undefined,
  payloadLength: number,
): CompletenessLevel {
  if (marker === 'LOADED') {
    return 'COMPLETE';
  }
  if (marker === 'NOT_LOADED') {
    return payloadLength > 0 ? 'PARTIAL' : 'MISSING';
  }
  // Legacy default: empty without explicit LOADED → data not retrieved
  return payloadLength > 0 ? 'PARTIAL' : 'MISSING';
}

export function evaluateWorldStateCompleteness(input: {
  worldState: TripWorldState;
  plan?: TripPlan;
  dataAvailability?: WorldStateDataAvailability;
}): WorldStateCompleteness {
  const physical = (input.worldState as { physical?: Record<string, unknown> }).physical ?? {};
  const signals = (input.worldState.signals ?? {}) as unknown as Record<string, unknown>;
  const availability = input.dataAvailability ?? {};

  const roadStates = Array.isArray(physical.roadStates) ? physical.roadStates : [];
  const hazardZones = Array.isArray(physical.hazardZones) ? physical.hazardZones : [];
  const ferryStates = Array.isArray(physical.ferryStates) ? physical.ferryStates : [];
  const weatherByDate =
    (signals.weatherByDate as Record<string, unknown> | undefined) ?? {};
  const weatherKeys = Object.keys(weatherByDate);

  const openingHoursLoaded = planHasOpeningHourChecks(input.plan);
  const poiIdentityLevel = evaluatePoiIdentityCompleteness(input.plan, availability.poiIdentity);

  return {
    roads: resolveSliceCompleteness(availability.roads, roadStates.length),
    weather: resolveSliceCompleteness(availability.weather, weatherKeys.length),
    hazards: resolveSliceCompleteness(availability.hazards, hazardZones.length),
    ferries: resolveSliceCompleteness(availability.ferries, ferryStates.length),
    openingHours: resolveSliceCompleteness(
      availability.openingHours,
      openingHoursLoaded ? 1 : 0,
    ),
    poiIdentity: poiIdentityLevel,
  };
}

function evaluatePoiIdentityCompleteness(
  plan?: TripPlan,
  marker?: 'LOADED' | 'NOT_LOADED',
): CompletenessLevel {
  if (!plan?.days?.length) {
    return resolveSliceCompleteness(marker, 0);
  }
  const audit = auditPlanPoiIdentity(plan, 'IS');
  if (audit.canonicalPoiIds.length === 0) {
    return resolveSliceCompleteness(marker, 0);
  }
  if (audit.allCanonical) {
    return marker === 'NOT_LOADED' ? 'PARTIAL' : 'COMPLETE';
  }
  return 'PARTIAL';
}

function planHasOpeningHourChecks(plan?: TripPlan): boolean {
  if (!plan?.days?.length) return false;
  return plan.days.some((day) => (day.timeSlots?.length ?? 0) > 0 && day.timeSlots.some((s) => !!s.poiId));
}

export function planRequiresRoadData(plan: TripPlan, worldState?: TripWorldState): boolean {
  for (const day of plan.days ?? []) {
    for (const slot of day.timeSlots ?? []) {
      if (slot.travelLegFromPrev?.mode === 'drive') {
        return true;
      }
    }
  }
  return worldState?.context?.travelModeDefault === 'drive';
}

export function planRequiresFerryData(plan: TripPlan): boolean {
  for (const day of plan.days ?? []) {
    for (const slot of day.timeSlots ?? []) {
      const tags = slot.semanticTags ?? [];
      if (tags.some((t) => /ferry|渡轮/i.test(t))) {
        return true;
      }
    }
  }
  return false;
}

export const COMPLETENESS_EVALUATOR_META = { engine: ENGINE, version: VERSION };
