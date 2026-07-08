/**
 * Unified NL intent → Decision Trigger Gateway routing (S1).
 */

import type {
  DecisionRunDispatchResult,
  DecisionRunRequest,
  DecisionTriggerKind,
  DecisionRunRouteTarget,
} from '../../contracts/decision-run-request';

export const TRIP_INTENT_ROUTE_RESULT_SCHEMA_ID = 'tripnara.trip_intent_route_result@v1';

export type TripIntentKind =
  | 'PLAN_TRIP'
  | 'MODIFY_ITINERARY'
  | 'FEASIBILITY_CHECK'
  | 'WEATHER_RISK'
  | 'SWAP_LODGING'
  | 'SWAP_ACTIVITY'
  | 'DECISION_STATUS'
  | 'GENERAL_QUERY';

export interface TripIntentClassification {
  kind: TripIntentKind;
  confidence: number;
  matchedRule: string;
  triggerKind: DecisionTriggerKind;
  routeTargetHint: DecisionRunRouteTarget;
}

export interface TripIntentContextSnapshotRef {
  snapshotId: string;
  revision: string;
  constraintsVersion: number;
  effectivePlanVersionId?: string;
}

export type TripIntentSuggestedAction =
  | 'CALL_ROUTE_AND_RUN'
  | 'OPEN_DECISION_QUEUE'
  | 'REVIEW_DISPATCH_RESULT'
  | 'NONE';

export interface TripIntentRouteResult {
  schemaId: typeof TRIP_INTENT_ROUTE_RESULT_SCHEMA_ID;
  tripId: string;
  message: string;
  generatedAt: string;
  classification: TripIntentClassification;
  contextSnapshot: TripIntentContextSnapshotRef;
  suggestedAction: TripIntentSuggestedAction;
  dispatch?: DecisionRunDispatchResult | DecisionRunRequest;
  decisionQueueHeadline?: string;
  openDecisionCount?: number;
}

export interface RouteTripIntentInput {
  tripId: string;
  message: string;
  userId?: string;
  problemId?: string;
  dayIndex?: number;
  /** Skip Gateway dispatch — classify + snapshot only */
  dryRun?: boolean;
}
