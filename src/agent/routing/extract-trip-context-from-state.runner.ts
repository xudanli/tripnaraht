/**
 * 从 OrchestratorState 提取 TripContext（从 ClaudeOrchestrator 迁出）。
 */

import type { ExtractTripContextFromStateHost } from './extract-trip-context-from-state.host';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  TripContext,
  TravelerProfile,
  ItineraryInfo,
} from '../../trips/readiness/types/trip-context.types';

export function extractTripContextFromState(
  host: ExtractTripContextFromStateHost,
  state: OrchestratorState,
): TripContext {
  const request = state.trip_plan_request;
  if (!request) {
    return {
      traveler: {},
      trip: {},
      itinerary: {
        countries: [],
      },
    };
  }

  const destination =
    typeof request.destination === 'string' ? request.destination : 'UNKNOWN';

  const countryCode = destination.split('-')[0] || destination.split(',')[0] || 'UNKNOWN';

  const memoryNationality = host.agentMemoryContextStore?.get()?.userBasics?.nationality;
  const traveler: TravelerProfile = {
    nationality: memoryNationality,
    residencyCountry: undefined,
    tags: [],
    budgetLevel: request.constraints?.budget?.total
      ? request.constraints.budget.total > 5000
        ? 'high'
        : request.constraints.budget.total > 2000
          ? 'medium'
          : 'low'
      : undefined,
    riskTolerance: undefined,
  };

  const itinerary: ItineraryInfo = {
    countries: [countryCode],
    activities: [],
    season: request.date_range?.start_date
      ? host.extractSeason(request.date_range.start_date)
      : undefined,
  };

  return {
    traveler,
    trip: {
      startDate: request.date_range?.start_date || request.start_date,
      endDate: request.date_range?.end_date,
    },
    itinerary,
  };
}
