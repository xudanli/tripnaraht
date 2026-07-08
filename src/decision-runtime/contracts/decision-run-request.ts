/**
 * Decision Run Request — normalized entry contract for Decision Trigger Gateway.
 * @see DECISION_RUNTIME_MATURITY.md §8 P1
 * @see ADR-007-Decision-Runtime-v2.md
 */

import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate, PlanningContext } from '../candidates/contracts/decision-candidate';
import type { TripWorldState } from '../../trips/decision/world-model';

export const DECISION_RUN_REQUEST_SCHEMA_ID = 'tripnara.decision_run_request@v1';
export const DECISION_RUN_DISPATCH_SCHEMA_ID = 'tripnara.decision_run_dispatch@v1';

/** What initiated the decision run. */
export type DecisionTriggerKind =
  | 'USER_INTENT'
  | 'WORLD_EVENT'
  | 'MANUAL_REPAIR_REQUEST'
  | 'GUIDE_IMPORT_REQUEST'
  | 'IN_TRIP_DEVIATION'
  | 'FULL_PLAN_SELECTION'
  | 'CANONICAL_PROBLEM_EVALUATE'
  | 'CANONICAL_MONITORING_POLL'
  | 'LEGACY_AGENT_ROUTE';

/** Downstream handler target after normalization + routing. */
export type DecisionRunRouteTarget =
  | 'FULL_PLAN_SELECTION'
  | 'CANONICAL_L2_EVALUATE'
  | 'CANONICAL_MONITORING'
  | 'AGENTIC_ORCHESTRATION'
  | 'LEGACY_DECISION_ENGINE'
  | 'UNSUPPORTED';

export type DecisionRunRequestSource =
  | 'HTTP'
  | 'UNIFIED_DECISION_API'
  | 'DECISION_ENGINE_API'
  | 'GUIDE_TO_PLAN'
  | 'AGENT_ROUTE_AND_RUN'
  | 'WORLD_EVENT_BUS'
  | 'INTERNAL';

export type CanonicalMonitoringPollKind = 'WEATHER_HAZARD' | 'DAILY_LOAD';

/** Raw trigger input before normalization. */
export interface DecisionTriggerInput {
  kind: DecisionTriggerKind;
  tripId: string;
  source: DecisionRunRequestSource;
  requestId?: string;
  problemId?: string;
  decisionId?: string;
  userId?: string;
  eventId?: string;
  semanticCapability?: string;
  idempotencyKey?: string;
  fullPlanSelection?: FullPlanSelectionTriggerPayload;
  monitoring?: {
    pollKind: CanonicalMonitoringPollKind;
    dayIndex?: number;
    runFull?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface FullPlanSelectionTriggerPayload {
  worldState: TripWorldState;
  context: PlanningContext;
  problemId?: string;
  prebuiltCandidates?: DecisionCandidate[];
  constraintReportsByCandidateId?: Record<string, CanonicalConstraintReport>;
  /** select = Gateway → finalize; evaluate_only = constraint pass without finalize */
  operation?: 'select' | 'evaluate_only';
}

/** Normalized, immutable decision run descriptor. */
export interface DecisionRunRequest {
  schemaId: typeof DECISION_RUN_REQUEST_SCHEMA_ID;
  runId: string;
  tripId: string;
  triggerKind: DecisionTriggerKind;
  routeTarget: DecisionRunRouteTarget;
  source: DecisionRunRequestSource;
  createdAt: string;
  problemId?: string;
  decisionId?: string;
  userId?: string;
  eventId?: string;
  semanticCapability?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export type DecisionRunDispatchStatus =
  | 'COMPLETED'
  | 'DELEGATED'
  | 'UNSUPPORTED'
  | 'FAILED';

export interface DecisionRunDispatchResult {
  schemaId: typeof DECISION_RUN_DISPATCH_SCHEMA_ID;
  runId: string;
  routeTarget: DecisionRunRouteTarget;
  status: DecisionRunDispatchStatus;
  request: DecisionRunRequest;
  result?: unknown;
  error?: { code: string; message: string };
}
