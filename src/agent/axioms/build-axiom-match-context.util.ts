import type { ClarificationAnswer } from '../interfaces/clarification.interface';
import type { Itinerary, TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  analyzeRouteAndRunIntent,
  type RouteAndRunIntentAnalysis,
} from '../utils/route-and-run-intent-analyzer.util';
import { applyClarificationAndTripToSubSignals } from './axiom-clarification-signals.util';
import type { AxiomMatchContext } from './axiom-matchers';

export function buildAxiomMatchContext(input: {
  message?: string | null;
  constraints?: Record<string, any> | undefined;
  trip?: TripPlanRequest | null;
  tripId?: string | null;
  hasTripDays?: boolean;
  /** When set (e.g. orchestrator metadata), used as base before clarification/trip merge. */
  routeAndRunIntent?: RouteAndRunIntentAnalysis | null;
  clarificationAnswers?: ClarificationAnswer[] | null;
  itinerary?: Pick<Itinerary, 'days'> | null;
}): AxiomMatchContext {
  const trip = input.trip ?? undefined;
  const itinerary = input.itinerary ?? undefined;
  const message = String(input.message ?? trip?.message ?? '').trim() || undefined;
  const tripId = input.tripId?.trim() || trip?.trip_id?.trim() || undefined;
  const clarificationAnswers = Array.isArray(input.clarificationAnswers)
    ? input.clarificationAnswers
    : undefined;

  const baseAnalysis =
    input.routeAndRunIntent ??
    analyzeRouteAndRunIntent(message, {
      trip,
      tripId,
      hasTripDays: input.hasTripDays,
    });

  const { analysis, subSignalSources } = applyClarificationAndTripToSubSignals({
    analysis: baseAnalysis,
    trip,
    itinerary,
    clarificationAnswers,
  });

  return {
    message,
    constraints: input.constraints ?? trip?.constraints,
    trip,
    itinerary,
    routeAndRun: analysis,
    subSignalSources,
    clarificationAnswers,
    tripId,
  };
}
