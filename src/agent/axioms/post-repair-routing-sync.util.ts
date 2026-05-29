import { buildAxiomMatchContext } from './build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from './axiom-matchers';
import { extractPlanRoutingMetrics, syncPlanRoutingMetricsToTripPlan } from './plan-routing-metrics.util';
import type { PlanRoutingMetrics } from './plan-routing-metrics.types';
import type { Itinerary, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { RouteAndRunIntentAnalysis } from '../utils/route-and-run-intent-analyzer.util';
import type { ClarificationAnswer } from '../interfaces/clarification.interface';

/**
 * REPAIR 修订 itinerary 后立刻刷新 trip 上的 PLAN_GEN 路由实数，避免 terminal-audit 仍读旧指标。
 */
export function applyPostRepairRoutingMetricsSync(input: {
  trip: TripPlanRequest;
  itinerary: Pick<Itinerary, 'days'>;
  metadata?: Record<string, unknown>;
  message?: string;
  routeAndRunIntent?: RouteAndRunIntentAnalysis | null;
  clarificationAnswers?: ClarificationAnswer[];
}): {
  trip: TripPlanRequest;
  postRepairDominantAxiomCid: string;
  routingMetrics: PlanRoutingMetrics | undefined;
} {
  const trip = syncPlanRoutingMetricsToTripPlan(input.trip, input.itinerary);
  const routingMetrics = extractPlanRoutingMetrics(trip, input.itinerary);

  const dom = pickDominantAxiom(
    matchAxioms(
      buildAxiomMatchContext({
        message: input.message ?? trip.message,
        trip,
        itinerary: input.itinerary,
        routeAndRunIntent: input.routeAndRunIntent,
        clarificationAnswers: input.clarificationAnswers,
      }),
    ),
  );
  const postRepairDominantAxiomCid = dom?.axiom?.cid ?? 'NONE';

  if (input.metadata) {
    input.metadata.post_repair_routing_sync_at = new Date().toISOString();
    input.metadata.post_repair_dominant_axiom_cid = postRepairDominantAxiomCid;
    if (routingMetrics) {
      input.metadata.post_repair_pure_driving_minutes = routingMetrics.pure_driving_minutes;
      input.metadata.post_repair_max_single_day_driving_minutes =
        routingMetrics.max_single_day_driving_minutes;
    }
  }

  return { trip, postRepairDominantAxiomCid, routingMetrics };
}
