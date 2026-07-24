import type { ClarificationAnswer } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { isFroad2wdComplianceScenario } from '../utils/froad-intake-signals.util';
import type {
  RouteAndRunIntentAnalysis,
  RouteAndRunSubSkuSignals,
} from '../utils/route-and-run-intent-analyzer.util';
import {
  extractPlanRoutingMetrics,
  isPlanRoutingFatigueOverloaded,
} from './plan-routing-metrics.util';
import type { AxiomMatchSource } from './axiom-schema';
import type { Itinerary } from '../interfaces/trip-plan.interface';

export type SubSignalSources = Partial<Record<keyof RouteAndRunSubSkuSignals, AxiomMatchSource>>;

function markSource(
  sources: SubSignalSources,
  key: keyof RouteAndRunSubSkuSignals,
  source: AxiomMatchSource,
): void {
  sources[key] = source;
}

/**
 * Reconcile Layer-1 SKU booleans with clarification answers and mutated trip_plan_request.
 * Clarification / trip scheduling wins over stale first-turn route_and_run_intent.
 */
export function applyClarificationAndTripToSubSignals(input: {
  analysis: RouteAndRunIntentAnalysis;
  trip?: TripPlanRequest | null;
  itinerary?: Pick<Itinerary, 'days'> | null;
  clarificationAnswers?: ClarificationAnswer[];
}): { analysis: RouteAndRunIntentAnalysis; subSignalSources: SubSignalSources } {
  const sub: RouteAndRunSubSkuSignals = { ...input.analysis.sub_signals };
  const subSignalSources: SubSignalSources = {};

  for (const key of Object.keys(sub) as (keyof RouteAndRunSubSkuSignals)[]) {
    if (sub[key]) markSource(subSignalSources, key, 'INTENT_SIGNAL');
  }

  const trip = input.trip;
  const gctx = trip?.guardian_debate_trip_context;
  const sched = gctx?.scheduling_constraints;
  const anchors = gctx?.user_intent_anchors;
  const nl = input.analysis.intake_nl;

  if (
    sched?.whale_watching_slot ||
    sched?.midnight_sun_slot_locked ||
    anchors?.peak_season_crowd_avoidance
  ) {
    sub.peak_season_crowd_avoidance = true;
    markSource(subSignalSources, 'peak_season_crowd_avoidance', 'CLARIFICATION');
  }
  if (anchors?.whale_watching_husavik) {
    sub.whale_watching_north = true;
    markSource(subSignalSources, 'whale_watching_north', 'CLARIFICATION');
  }
  if (sched?.itinerary_slot_placement?.date_ymd && /观鲸|whale|husavík|husavik|胡萨维克/i.test(nl)) {
    sub.whale_watching_north = true;
    markSource(subSignalSources, 'whale_watching_north', 'CLARIFICATION');
  }

  if (trip?.constraints?.vehicle_type === '4WD') {
    sub.froad_2wd_compliance = false;
  } else if (trip) {
    const still = isFroad2wdComplianceScenario(trip, nl);
    sub.froad_2wd_compliance = still;
    if (still && !subSignalSources.froad_2wd_compliance) {
      markSource(subSignalSources, 'froad_2wd_compliance', 'INTENT_SIGNAL');
    }
  }

  const routing = extractPlanRoutingMetrics(trip, input.itinerary);
  if (isPlanRoutingFatigueOverloaded(routing)) {
    sub.marathon_deferred = true;
    markSource(subSignalSources, 'marathon_deferred', 'CLARIFICATION');
  } else if (anchors?.midnight_sun_continuous_drive === true) {
    sub.marathon_deferred = true;
    markSource(subSignalSources, 'marathon_deferred', 'CLARIFICATION');
  } else if (
    anchors?.midnight_sun_continuous_drive === false ||
    anchors?.user_accepted_segmented_ring
  ) {
    sub.marathon_deferred = false;
  }

  for (const ans of input.clarificationAnswers ?? []) {
    const qid = ans.questionId;
    const v = String(ans.value ?? '').trim();
    if (qid === 'peak_season_midnight_sun_whale_v1' && v === 'LOCK_MIDNIGHT_SUN_WHALE_SLOT') {
      sub.peak_season_crowd_avoidance = true;
      sub.whale_watching_north = true;
      markSource(subSignalSources, 'peak_season_crowd_avoidance', 'CLARIFICATION');
      markSource(subSignalSources, 'whale_watching_north', 'CLARIFICATION');
    }
    if (qid === 'itinerary_slot_placement_v1' && /^PLACE_ON_D\d+/i.test(v)) {
      if (/观鲸|whale|husavík|husavik|胡萨维克/i.test(nl)) {
        sub.whale_watching_north = true;
        markSource(subSignalSources, 'whale_watching_north', 'CLARIFICATION');
      }
    }
    if (qid === 'froad_2wd_compliance_v1') {
      if (v === 'UPGRADE_VEHICLE_TO_4WD' || v === 'upgrade_vehicle_to_4wd') {
        sub.froad_2wd_compliance = false;
      } else if (v) {
        sub.froad_2wd_compliance = true;
        markSource(subSignalSources, 'froad_2wd_compliance', 'CLARIFICATION');
      }
    }
    if (qid === 'marathon_continuous_drive_v1' && v) {
      sub.marathon_deferred = true;
      markSource(subSignalSources, 'marathon_deferred', 'CLARIFICATION');
    }
    if (qid === 'guardian_debate_abu_reject_v1' && v === 'accept_neptune_alternative') {
      sub.marathon_deferred = false;
    }
  }

  return {
    analysis: { ...input.analysis, sub_signals: sub },
    subSignalSources,
  };
}
