/**
 * PR-4 — 将 DSO party 投影为 MultiPersonDecisionService 输入，并摘要协调结果写入 DSO。
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { RouteDirectionData } from '../../route-directions/interfaces/route-direction.interface';
import type { DecisionState } from './decision-state.types';
import type {
  CoordinationResult,
  RoutePlanDraft,
} from '../../trips/decision/interfaces/multi-person-coordination.interface';
import {
  InterestProfile,
  MobilityProfile,
  type TravelerInfo,
} from '../../trips/interfaces/pacing-config.interface';

function isItineraryLike(planDraft: unknown): planDraft is Itinerary {
  const draft = planDraft as Itinerary | undefined;
  return !!draft && Array.isArray(draft.days) && draft.days.length > 0;
}

function buildPartyCoordinationRoutePlan(state: DecisionState, itinerary: Itinerary): RoutePlanDraft {
  const env = state.environmentState;
  const corridor = env?.routeCorridorWorld;
  const routeDirectionId = env?.routeDirectionId ?? 'unknown';
  const countryCode = env?.countryCode ?? 'unknown';
  const label = corridor?.regionLabel ?? String(routeDirectionId);
  const route: RouteDirectionData = {
    id: routeDirectionId,
    countryCode,
    name: label,
    nameCN: label,
    tags: corridor?.poiHints ?? [],
    constraints: corridor?.constraints as RouteDirectionData['constraints'],
  };
  if (env?.failureRiskLevel === 'HIGH') {
    route.riskProfile = { weatherWindow: true };
  }
  return {
    route,
    estimatedDays: itinerary.days.length || state.userIntent?.days,
    estimatedBudget: itinerary.metadata?.total_cost_estimate,
  };
}

export function shouldRunPartyCoordination(state: DecisionState): boolean {
  const count = state.userIntent?.party?.count ?? 0;
  return count >= 2;
}

export function buildTravelersFromParty(state: DecisionState): TravelerInfo[] {
  const party = state.userIntent?.party as
    | { count?: number; has_elderly?: boolean; fitnessLevel?: string; fitness_level?: string }
    | undefined;
  const count = Math.max(1, party?.count ?? 1);
  const travelers: TravelerInfo[] = [];

  const fitness = String(party?.fitnessLevel ?? party?.fitness_level ?? 'MEDIUM').toUpperCase();
  const mobility =
    fitness === 'LOW' || party?.has_elderly
      ? MobilityProfile.ACTIVE_SENIOR
      : fitness === 'HIGH'
        ? MobilityProfile.IRON_LEGS
        : MobilityProfile.CITY_POTATO;

  if (party?.has_elderly && count >= 2) {
    travelers.push({
      interestProfile: InterestProfile.ELDERLY,
      mobilityProfile: MobilityProfile.ACTIVE_SENIOR,
      count: 1,
    });
    travelers.push({
      interestProfile: InterestProfile.ADULT,
      mobilityProfile: mobility,
      count: Math.max(1, count - 1),
    });
    return travelers;
  }

  travelers.push({
    interestProfile: InterestProfile.ADULT,
    mobilityProfile: mobility,
    count,
  });
  return travelers;
}

export function resolveRoutePlanDraftForPartyCoordination(state: DecisionState): RoutePlanDraft | undefined {
  const planDraft = state.tripState?.planDraft;
  if (!isItineraryLike(planDraft)) return undefined;
  return buildPartyCoordinationRoutePlan(state, planDraft);
}

export function summarizePartyCoordination(result: CoordinationResult): {
  conflictCount: number;
  highSeverityCount: number;
  topStrategy?: string;
  overallRecommendation: string;
} {
  const highSeverityCount = result.conflictAreas.filter((c) => c.severity === 'HIGH').length;
  return {
    conflictCount: result.conflictAreas.length,
    highSeverityCount,
    topStrategy: result.optionsForCoordination[0]?.strategy,
    overallRecommendation: result.overallRecommendation,
  };
}

export function attachPartyCoordinationToResearchData(
  state: DecisionState,
  result: CoordinationResult,
): Record<string, unknown> {
  const rd = { ...(state.research_data as Record<string, unknown> | undefined) };
  rd.partyCoordination = {
    schemaVersion: 'party-coordination/v1',
    summary: summarizePartyCoordination(result),
    conflictAreas: result.conflictAreas.slice(0, 8),
    optionsForCoordination: result.optionsForCoordination.slice(0, 4).map((o) => ({
      id: o.id,
      strategy: o.strategy,
      suitabilityScore: o.suitabilityScore,
    })),
    suggestedDiscussionPoints: result.suggestedDiscussionPoints.slice(0, 4),
  };
  return rd;
}
