/**
 * Execution reduction: multi-subsystem signals → one overlay frame per corridor leg.
 *
 * Fusion policy (v1):
 * - When SEQUENCE drifts exist for the slot, they are treated as authoritative merged runtime delay.
 * - Otherwise unified delay composes route corridor shift + estimated weather padding.
 * - finalExecutionState uses pessimistic merge across domains (BLOCKED > HIGH_RISK > DEGRADED > EXECUTABLE).
 */

import type { ISODate } from '../decision/world-model';
import type { TripPlan } from '../decision/plan-model';
import type { TravelLeg } from '../decision/world-model';
import type { WeatherExecutionSignal } from '../decision/execution/weather-execution-semantic-adapter';
import type { TimeDrift } from '../decision/temporal/time-drift.types';
import type { LegTemporalSafetyAssessment } from '../decision/temporal/leg-temporal-safety.types';
import type { ExecutionEnrichedTravelLeg } from '../routing/execution/execution-enriched-travel-leg.types';
import type { RouteExecutionAssessment } from '../routing/execution/route-execution-assessment.types';
import type { ExecutionState } from '../decision/hazard/travel-hazard.types';
import type { ExecutionOverlayFrame, WeatherOverlaySeverity } from './execution-overlay-frame.types';
import { EXECUTION_OVERLAY_SCHEMA_VERSION } from './execution-overlay-frame.types';
import type { FuelReachabilitySummary } from '../fuel/fuel-reachability.types';
import type { WorldConstraintStoreSnapshot } from '../../world/world-snapshot';
import { evaluateConstraintFeasibilityForSlot } from '../../world/world-constraint-feasibility.policy';

const STATE_RANK: Record<ExecutionState, number> = {
  EXECUTABLE: 0,
  DEGRADED: 1,
  HIGH_RISK: 2,
  BLOCKED: 3,
};

function worse(a: ExecutionState, b: ExecutionState): ExecutionState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

function defaultRouteAssessment(legId: string, leg: TravelLeg): RouteExecutionAssessment {
  return {
    legId,
    terrainDifficulty: 'LOW',
    weatherExposure: {},
    roadAccessibility: { fRoad: false },
    executionReliability: typeof leg.reliability === 'number' ? leg.reliability : 0.72,
    estimatedDelayFactor: 1,
    executionState: 'EXECUTABLE',
  };
}

function weatherSeverity(wx: WeatherExecutionSignal | undefined): WeatherOverlaySeverity {
  if (!wx) return 'LOW';
  if (wx.violation === 'HARD' || wx.executionState === 'BLOCKED') return 'BLOCKED';
  if (wx.executionState === 'HIGH_RISK') return 'HIGH';
  if (wx.executionState === 'DEGRADED') return 'MEDIUM';
  if (wx.violation === 'SOFT') return 'MEDIUM';
  return 'LOW';
}

function weatherDelayMinutes(wx: WeatherExecutionSignal | undefined): number {
  if (!wx) return 0;
  if (typeof wx.recommendedExtraDriveMinutes === 'number' && wx.recommendedExtraDriveMinutes > 0) {
    return wx.recommendedExtraDriveMinutes;
  }
  const df = wx.executionQuality?.delayFactor ?? 1;
  if (df <= 1.02) return 0;
  return Math.min(120, Math.round((df - 1) * 75));
}

function weatherReliability(wx: WeatherExecutionSignal | undefined): number {
  if (!wx?.executionQuality) return 0.85;
  const safe = wx.executionQuality.safeScore ?? 0.75;
  const risk = wx.executionQuality.riskBudget ?? 0.5;
  return Math.max(0.15, Math.min(1, (safe + risk) / 2));
}

function sumSequenceDriftForSlot(drifts: TimeDrift[] | undefined, slotId: string): number {
  if (!drifts?.length) return 0;
  return drifts
    .filter(d => d.propagationPolicy === 'PROPAGATE_SEQUENCE' && d.sourceSlotId === slotId)
    .reduce((s, d) => s + d.deltaMinutes, 0);
}

function crossDayRiskForSlot(
  slotId: string,
  date: ISODate,
  drifts: TimeDrift[] | undefined,
  crossDayShiftedSlotIds: string[] | undefined,
): number {
  let r = 0;
  if (crossDayShiftedSlotIds?.includes(slotId)) {
    r = Math.max(r, 0.75);
  }
  if (!drifts?.length) return Math.min(1, r);
  const cross = drifts.filter(
    d =>
      d.propagationPolicy === 'PROPAGATE_CROSS_DAY' &&
      (d.sourceSlotId === slotId || d.date === date),
  );
  const crossDelta = cross.reduce((s, d) => s + d.deltaMinutes, 0);
  if (crossDelta > 0) {
    r = Math.max(r, Math.min(1, crossDelta / 90));
  }
  return Math.min(1, r);
}

function daylightViolationForSlot(
  slotId: string,
  assessments: LegTemporalSafetyAssessment[] | undefined,
): boolean {
  const keys = [slotId, `arrival:${slotId}`];
  const a = assessments?.find(x => keys.includes(x.legId));
  if (!a) return false;
  return a.severity === 'UNSAFE' || a.safeArrival === false;
}

function resolveFinalState(args: {
  route: RouteExecutionAssessment;
  weather: WeatherOverlaySeverity;
  roadBlocked: boolean;
  daylightViolation: boolean;
  weatherSignal?: WeatherExecutionSignal;
  fuel?: FuelReachabilitySummary;
}): ExecutionState {
  if (args.roadBlocked || args.route.executionState === 'BLOCKED') {
    return 'BLOCKED';
  }
  if (args.fuel?.severity === 'CRITICAL' && args.fuel.safeBeforeNextFuel === false) {
    return 'BLOCKED';
  }
  if (args.weather === 'BLOCKED') {
    return 'BLOCKED';
  }

  let s: ExecutionState = args.route.executionState;
  if (args.daylightViolation) {
    s = worse(s, 'HIGH_RISK');
  }
  if (args.weatherSignal?.executionState) {
    s = worse(s, args.weatherSignal.executionState);
  } else if (args.weather === 'HIGH') {
    s = worse(s, 'HIGH_RISK');
  } else if (args.weather === 'MEDIUM') {
    s = worse(s, 'DEGRADED');
  }
  if (args.fuel && !args.fuel.safeBeforeNextFuel && args.fuel.severity !== 'CRITICAL') {
    if (args.fuel.severity === 'MEDIUM') {
      s = worse(s, 'DEGRADED');
    } else {
      s = worse(s, 'HIGH_RISK');
    }
  }
  return s;
}

function fuelReliabilityPenalty(fuel: FuelReachabilitySummary | undefined): number {
  if (!fuel) return 0;
  if (fuel.severity === 'CRITICAL') return 0.3;
  if (fuel.severity === 'HIGH') return 0.15;
  if (fuel.severity === 'MEDIUM') return 0.08;
  return 0;
}

export interface BuildExecutionOverlayInput {
  plan: TripPlan;
  weatherByDate?: Partial<Record<ISODate, WeatherExecutionSignal>>;
  timeDrifts?: TimeDrift[];
  crossDayShiftedSlotIds?: string[];
  legTemporalSafetyAssessments?: LegTemporalSafetyAssessment[];
  /** External road closure layer — keyed by slot id */
  roadConstraintHints?: Partial<Record<string, { blocked?: boolean }>>;
  /** 世界 SSOT 快照：与 `roadConstraintHints` 合并，槽位级裁决见 `evaluateConstraintFeasibilityForSlot` */
  worldConstraintSnapshot?: WorldConstraintStoreSnapshot;
  /** 默认 true：当 SSOT 对某槽位给出 BLOCK 时，合并到 `road.blocked` */
  mergeWorldFeasibilityIntoRoadBlocked?: boolean;
  /** P-FUEL-1：slot id → fuel envelope vs next fuel along corridor */
  fuelReachabilityByLegId?: Partial<Record<string, FuelReachabilitySummary>>;
}

/**
 * One frame per slot that has inbound travel (`travelLegFromPrev`). Requires route overlay when available.
 */
export function buildExecutionOverlay(input: BuildExecutionOverlayInput): ExecutionOverlayFrame[] {
  const drifts = input.timeDrifts ?? [];
  const mergeFeasibility = input.mergeWorldFeasibilityIntoRoadBlocked !== false;
  const frames: ExecutionOverlayFrame[] = [];

  for (const day of input.plan.days) {
    const wxDay = input.weatherByDate?.[day.date];
    const df = wxDay?.executionQuality?.delayFactor ?? 1;

    for (const slot of day.timeSlots) {
      const leg = slot.travelLegFromPrev;
      if (!leg) continue;

      const enriched: ExecutionEnrichedTravelLeg | undefined = slot.routeExecutionOverlay;
      const route: RouteExecutionAssessment = enriched?.execution ?? defaultRouteAssessment(slot.id, leg);

      const sequenceSum = sumSequenceDriftForSlot(drifts, slot.id);
      const wxSeverity = weatherSeverity(wxDay);
      const wxDelay = weatherDelayMinutes(wxDay);
      const routeShift = enriched?.temporalImpact.expectedArrivalShiftMinutes ?? 0;

      let unifiedDelayMinutes: number;
      if (sequenceSum > 0) {
        unifiedDelayMinutes = sequenceSum;
      } else {
        unifiedDelayMinutes = Math.round(routeShift + wxDelay * 0.35);
      }

      const hintBlocked = Boolean(input.roadConstraintHints?.[slot.id]?.blocked);
      const slotFeas =
        mergeFeasibility && input.worldConstraintSnapshot !== undefined
          ? evaluateConstraintFeasibilityForSlot({
              snapshot: input.worldConstraintSnapshot,
              slotId: slot.id,
            })
          : undefined;
      const roadBlocked =
        hintBlocked || (slotFeas?.verdict === 'BLOCK');
      const fRoadConstraint = route.roadAccessibility?.fRoad ?? false;
      const daylightViolation = daylightViolationForSlot(slot.id, input.legTemporalSafetyAssessments);
      const fuel = input.fuelReachabilityByLegId?.[slot.id];

      const finalExecutionState = resolveFinalState({
        route,
        weather: wxSeverity,
        roadBlocked,
        daylightViolation,
        weatherSignal: wxDay,
        fuel,
      });

      let reliabilityScore = Math.min(
        route.executionReliability,
        weatherReliability(wxDay),
        enriched?.eta.reliabilityScore ?? route.executionReliability,
      );
      reliabilityScore -= crossDayRiskForSlot(slot.id, day.date, drifts, input.crossDayShiftedSlotIds) * 0.12;
      reliabilityScore -= fuelReliabilityPenalty(fuel);
      reliabilityScore = Math.max(0.08, Math.min(1, reliabilityScore));

      frames.push({
        schemaVersion: EXECUTION_OVERLAY_SCHEMA_VERSION,
        legId: slot.id,
        route,
        temporal: {
          driftMinutes: sequenceSum,
          crossDayRisk: crossDayRiskForSlot(slot.id, day.date, drifts, input.crossDayShiftedSlotIds),
          daylightViolation,
          unifiedDelayMinutes,
        },
        weather: {
          severity: wxSeverity,
          delayFactor: df,
        },
        road: {
          blocked: roadBlocked,
          fRoadConstraint: fRoadConstraint,
        },
        ...(fuel ? { fuel } : {}),
        repair: { recommended: false },
        finalExecutionState,
        unifiedDelayMinutes,
        reliabilityScore,
      });
    }
  }

  return frames;
}
