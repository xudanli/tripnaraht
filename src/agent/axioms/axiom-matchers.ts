import type { ClarificationAnswer } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { AxiomId, AxiomMatchSource, AxiomMetricDetails, AxiomSchema } from './axiom-schema';
import { AXIOM_REGISTRY } from './axiom-registry';
import { validateAxiomMatchResult } from './axiom-evidence-validator.util';
import type { SubSignalSources } from './axiom-clarification-signals.util';
import {
  extractPlanRoutingMetrics,
  isPlanRoutingFatigueOverloaded,
  SINGLE_DAY_DRIVING_LIMIT_MINUTES,
} from './plan-routing-metrics.util';
import { buildFroadHighlandIntentSignals } from '../utils/froad-intake-signals.util';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { RouteAndRunIntentAnalysis } from '../utils/route-and-run-intent-analyzer.util';

export interface AxiomMatchContext {
  message?: string;
  constraints?: Record<string, any> | undefined;
  trip?: TripPlanRequest | null;
  /** PLAN_GEN/VERIFY 热路径：无 trip.routing_metrics 时从草案现场汇总。 */
  itinerary?: Pick<Itinerary, 'days'> | null;
  routeAndRun?: RouteAndRunIntentAnalysis;
  subSignalSources?: SubSignalSources;
  clarificationAnswers?: ClarificationAnswer[];
  tripId?: string;
}

export interface AxiomMatchResult {
  axiom: AxiomSchema;
  axiom_id: AxiomId;
  evidence: Record<string, any>;
}

function msg(s: unknown): string {
  return String(s ?? '').trim();
}

function round(n: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function signalSource(
  ctx: AxiomMatchContext,
  key: keyof RouteAndRunIntentAnalysis['sub_signals'],
  fallback: AxiomMatchSource,
): AxiomMatchSource {
  return ctx.subSignalSources?.[key] ?? fallback;
}

function packEvidence(
  matchSource: AxiomMatchSource,
  metric_details: AxiomMetricDetails,
  proof_payload: Record<string, unknown>,
): Record<string, any> {
  return { match_source: matchSource, metric_details, proof_payload };
}

function collectFroadSignals(
  ctx: AxiomMatchContext,
  froad?: ReturnType<typeof buildFroadHighlandIntentSignals> | null,
): unknown[] {
  const signals: unknown[] = [];
  const sub = ctx.routeAndRun?.sub_signals;
  if (sub) {
    for (const [key, active] of Object.entries(sub)) {
      if (active) signals.push(key);
    }
  }
  if (froad?.primary_froad) signals.push(froad.primary_froad);
  if (wantsFRoad(ctx.message)) signals.push('message_froad_keyword');
  return signals.length > 0 ? signals : ['froad_unspecified'];
}

function pushValidated(out: AxiomMatchResult[], match: AxiomMatchResult | undefined): void {
  if (!match) return;
  validateAxiomMatchResult(match);
  out.push(match);
}

function detectVehicleType(input: {
  message?: string;
  constraints?: Record<string, any>;
  trip?: TripPlanRequest | null;
}): '2WD' | '4WD' | '' {
  const c = String(input.constraints?.vehicle_type ?? input.trip?.constraints?.vehicle_type ?? '').toUpperCase();
  if (c === '2WD' || c === '4WD') return c as '2WD' | '4WD';
  const m = msg(input.message);
  if (/4wd|4x4|四驱/i.test(m)) return '4WD';
  if (/2wd|两驱/i.test(m)) return '2WD';
  return '';
}

function wantsFRoad(message?: string): boolean {
  const m = msg(message);
  if (!m) return false;
  return /\bf-?road\b/i.test(m) || /\bF\d{2,4}\b/i.test(m) || /高地|内陆|山地|河渡|涉水/i.test(m);
}

/** Parse explicit driving-hour claims from NL (both word orders). */
export function parseDrivingHoursFromMessage(message?: string): number | undefined {
  const m = msg(message);
  if (!m) return undefined;
  const a = m.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)\s*(?:驾驶|driving)/i);
  if (a) return Number(a[1]);
  const b = m.match(/(?:驾驶|driving)\s*(\d+(?:\.\d+)?)\s*(?:h|小时)/i);
  if (b) return Number(b[1]);
  const c = m.match(/(\d+(?:\.\d+)?)\s*(?:h|小时)(?=\s*(?:不间断|连续|环))/i);
  if (c) return Number(c[1]);
  return undefined;
}

export function matchAxioms(ctx: AxiomMatchContext): AxiomMatchResult[] {
  const out: AxiomMatchResult[] = [];

  try {
    pushValidated(out, matchTerrainFroadUnfit(ctx));
  } catch {
    // best-effort
  }

  try {
    pushValidated(out, matchFatigueOverload(ctx));
  } catch {
    // best-effort
  }

  try {
    pushValidated(out, matchEtaInfeasible(ctx));
  } catch {
    // best-effort
  }

  return out;
}

function matchTerrainFroadUnfit(ctx: AxiomMatchContext): AxiomMatchResult | undefined {
  if (ctx.routeAndRun?.sub_signals?.froad_2wd_compliance) {
    const nl = ctx.routeAndRun.intake_nl || msg(ctx.message);
    const froad = buildFroadHighlandIntentSignals(nl);
    const matchSource = signalSource(ctx, 'froad_2wd_compliance', 'INTENT_SIGNAL');
    const metric_details: AxiomMetricDetails = {
      actual: 2,
      limit: 4,
      unit: 'WD',
      cmp: 'GEQ',
      slack: -2,
    };
    return {
      axiom: AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT,
      axiom_id: 'TERRAIN_F_ROAD_UNFIT',
      evidence: packEvidence(matchSource, metric_details, {
        vehicle_type: '2WD',
        vehicle_type_actual: '2WD',
        froad_signals: collectFroadSignals(ctx, froad),
        requires_4wd: true,
        intent_froad: true,
        primary_froad: froad?.primary_froad,
        destination_highland_zh: froad?.destination_highland_zh,
        slot_placement: ctx.trip?.guardian_debate_trip_context?.scheduling_constraints?.itinerary_slot_placement,
        trigger_reason: 'FROAD_VEHICLE_MISMATCH',
      }),
    };
  }

  const vehicle = detectVehicleType({
    message: ctx.message,
    constraints: ctx.constraints,
    trip: ctx.trip,
  });
  if (wantsFRoad(ctx.message) && vehicle === '2WD') {
    return {
      axiom: AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT,
      axiom_id: 'TERRAIN_F_ROAD_UNFIT',
      evidence: packEvidence(
        'HEURISTIC',
        { actual: 2, limit: 4, unit: 'WD', cmp: 'GEQ', slack: -2 },
        {
          vehicle_type: '2WD',
          vehicle_type_actual: vehicle,
          froad_signals: collectFroadSignals(ctx, null),
          requires_4wd: true,
          intent_froad: true,
          trigger_reason: 'FROAD_VEHICLE_MISMATCH',
        },
      ),
    };
  }

  return undefined;
}

function matchFatigueOverload(ctx: AxiomMatchContext): AxiomMatchResult | undefined {
  const nl = ctx.routeAndRun?.intake_nl || msg(ctx.message);
  const routing = extractPlanRoutingMetrics(ctx.trip, ctx.itinerary);
  const routeOverload = isPlanRoutingFatigueOverloaded(routing);
  const limitH = SINGLE_DAY_DRIVING_LIMIT_MINUTES / 60;
  const hasHeuristicText = /(驾驶|开车).*(超\s*10\s*小时|太累|开不动)/i.test(nl);

  const fatigueMinutesFromPlan = (): number => {
    if (!routing) return 600;
    if (routing.max_single_day_driving_minutes > SINGLE_DAY_DRIVING_LIMIT_MINUTES) {
      return routing.max_single_day_driving_minutes;
    }
    return routing.pure_driving_minutes;
  };

  const buildFatigueResult = (
    matchSource: AxiomMatchSource,
    plannedMin: number,
    trigger_reason: string,
  ): AxiomMatchResult => {
    const actualH = round(plannedMin / 60, 1);
    return {
      axiom: AXIOM_REGISTRY.FATIGUE_OVERLOAD,
      axiom_id: 'FATIGUE_OVERLOAD',
      evidence: packEvidence(
        matchSource,
        {
          actual: actualH,
          limit: limitH,
          unit: 'h',
          cmp: 'LEQ',
          slack: round(limitH - actualH, 1),
        },
        {
          planned_duration_minutes: plannedMin,
          pure_driving_minutes: routing?.pure_driving_minutes ?? plannedMin,
          max_single_day_driving_minutes: routing?.max_single_day_driving_minutes ?? plannedMin,
          day_segments_snapshot: routing?.day_segments,
          trigger_reason,
        },
      ),
    };
  };

  if (routeOverload) {
    const plannedMin = fatigueMinutesFromPlan();
    return buildFatigueResult('CLARIFICATION', plannedMin, 'PLAN_GEN_REAL_METRIC_OVERLOAD');
  }

  if (ctx.routeAndRun?.sub_signals?.marathon_deferred) {
    const parsed = parseDrivingHoursFromMessage(nl);
    const hours =
      typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 10
        ? parsed
        : /24\s*(?:h|小时)/i.test(nl)
          ? 24
          : 12;
    return buildFatigueResult(
      signalSource(ctx, 'marathon_deferred', 'INTENT_SIGNAL'),
      Math.round(hours * 60),
      'INTENT_MARATHON',
    );
  }

  const drivingHours = parseDrivingHoursFromMessage(nl);
  if (typeof drivingHours === 'number' && Number.isFinite(drivingHours) && drivingHours >= 10) {
    return buildFatigueResult('HEURISTIC', Math.round(drivingHours * 60), 'TEXT_EXPLICIT_EXPRESSION');
  }

  if (hasHeuristicText) {
    return buildFatigueResult('HEURISTIC', 600, 'TEXT_EXPLICIT_EXPRESSION');
  }

  return undefined;
}

function matchEtaInfeasible(ctx: AxiomMatchContext): AxiomMatchResult | undefined {
  const nl = ctx.routeAndRun?.intake_nl || msg(ctx.message);
  const sub = ctx.routeAndRun?.sub_signals;
  const slotLocked = Boolean(
    ctx.trip?.guardian_debate_trip_context?.scheduling_constraints?.midnight_sun_slot_locked ||
      ctx.trip?.guardian_debate_trip_context?.scheduling_constraints?.whale_watching_slot,
  );

  if (sub?.peak_season_crowd_avoidance || sub?.whale_watching_north || slotLocked) {
    const matchSource = sub?.peak_season_crowd_avoidance
      ? signalSource(ctx, 'peak_season_crowd_avoidance', 'INTENT_SIGNAL')
      : signalSource(ctx, 'whale_watching_north', 'INTENT_SIGNAL');
    const whaleSlot = ctx.trip?.guardian_debate_trip_context?.scheduling_constraints?.whale_watching_slot;
    const trigger_reason = slotLocked
      ? 'CLARIFICATION_SLOT_LOCKED'
      : sub?.peak_season_crowd_avoidance
        ? 'PEAK_SEASON_CROWD_AVOIDANCE'
        : sub?.whale_watching_north
          ? 'WHALE_WATCHING_NORTH'
          : 'ETA_SKU_SIGNAL';
    return {
      axiom: AXIOM_REGISTRY.ETA_INFEASIBLE,
      axiom_id: 'ETA_INFEASIBLE',
      evidence: packEvidence(
        slotLocked ? 'CLARIFICATION' : matchSource,
        { actual: 1, limit: 0, unit: 'bool', cmp: 'LEQ', slack: -1 },
        {
          sku_signal: sub?.peak_season_crowd_avoidance
            ? 'peak_season_crowd_avoidance'
            : 'whale_watching_north',
          intent_time_window: true,
          whale_watching_north: Boolean(sub?.whale_watching_north),
          whale_watching_slot: whaleSlot,
          itinerary_slot_placement:
            ctx.trip?.guardian_debate_trip_context?.scheduling_constraints?.itinerary_slot_placement,
          trigger_reason,
        },
      ),
    };
  }

  if (/赶不上|必须在.+前到|日落前|latest\s+arrival/i.test(nl)) {
    return {
      axiom: AXIOM_REGISTRY.ETA_INFEASIBLE,
      axiom_id: 'ETA_INFEASIBLE',
      evidence: packEvidence(
        'HEURISTIC',
        { actual: 1, limit: 0, unit: 'bool', cmp: 'LEQ', slack: -1 },
        { intent_time_window: true, trigger_reason: 'TEXT_HEURISTIC_ETA' },
      ),
    };
  }

  return undefined;
}

export function pickDominantAxiom(matches: AxiomMatchResult[]): AxiomMatchResult | undefined {
  if (!Array.isArray(matches) || matches.length === 0) return undefined;
  const score = (a: AxiomMatchResult) => (a.axiom.severity === 'P0' ? 0 : a.axiom.severity === 'P1' ? 1 : 2);
  return [...matches].sort((a, b) => score(a) - score(b))[0];
}
