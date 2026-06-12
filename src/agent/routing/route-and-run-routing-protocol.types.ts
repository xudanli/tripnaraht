/**
 * Product-level route_and_run routing protocol (above System1/2 tier projection).
 * SSOT for golden eval and ROUTE_AND_RUN_ROUTING_PROTOCOL.md.
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { GateResultStatus } from '../orchestration/orchestration-governance-matrix.constants';
import type { RouteClassDriftType } from './route-and-run-route-class-projection.util';

/** 自然语言进入后的六类主路由（+ 安全/澄清） */
export type RouteAndRunRouteClass =
  | 'QUICK_ANSWER'
  | 'CRUD_EDIT'
  | 'PARTIAL_REPLAN'
  | 'SLOT_PLACEMENT_CLARIFY'
  | 'FULL_DEEP_PLAN'
  | 'CONDITIONAL_BRANCH'
  | 'SAFETY_CONSENT_OR_BLOCK';

export type TripIdRequirement = 'none' | 'optional' | 'required';

export type DeepResearchV71Trigger = 'OFF' | 'ELIGIBLE' | 'REQUIRED';

export type OrchestrationDepth =
  | 'NONE'
  | 'LIGHT_LOOKUP'
  | 'PLAN_VERIFY_PARTIAL'
  | 'FULL_CHAIN';

/** 成功时客户端应读取的 payload 键（协议层，非穷举） */
export type SuccessPayloadProfile =
  | 'answer_text_only'
  | 'answer_plus_list'
  | 'timeline_patch'
  | 'ui_display_itinerary'
  | 'ui_display_dual_track'
  | 'clarification_card'
  | 'negotiation_payload';

export interface RouteAndRunGateBehavior {
  /** 门控终态或预期 */
  expectedGate?: GateResultStatus;
  /** 成功但需 Banner */
  allowFlawedDraftBanner?: boolean;
  /** 须 opt-in allow_flawed_draft_narrate */
  flawedDraftOptIn?: boolean;
  /** 典型 result.status */
  terminalStatus: 'OK' | 'NEED_MORE_INFO' | 'NEED_CONFIRMATION' | 'NEED_CONSENT' | 'FAILED';
}

export interface RouteAndRunRoutingExpectation {
  routeClass: RouteAndRunRouteClass;
  tripId: TripIdRequirement;
  needsClarificationBeforeWrite: boolean;
  allowsDirectItineraryWrite: boolean;
  successPayload: SuccessPayloadProfile;
  gate: RouteAndRunGateBehavior;
  deepResearchV71: DeepResearchV71Trigger;
  orchestrationDepth: OrchestrationDepth;
  asyncEligible: boolean;
  notes?: string;
}

export interface RouteAndRunGoldenEvalFixture {
  id: string;
  label: string;
  request: RouteAndRunRequestDto;
  expected: RouteAndRunRoutingExpectation;
}

export interface RouteAndRunRouteClassDecision {
  routeClass: RouteAndRunRouteClass;
  tripId: TripIdRequirement;
  needsClarificationBeforeWrite: boolean;
  allowsDirectItineraryWrite: boolean;
  deepResearchV71: DeepResearchV71Trigger;
  orchestrationDepth: OrchestrationDepth;
  asyncEligible: boolean;
  /** 规则链命中顺序（调试） */
  matchedRule: string;
}

/** Runtime shadow: protocol SSOT vs production proxy drift. */
export interface ShadowRouteClassEvalV1 {
  schemaId: 'tripnara.route_class_eval@v1';
  version: 1;
  traceId: string;
  isMatch: boolean;
  mismatchType: RouteClassDriftType;
  protocolRouteClass: RouteAndRunRouteClass;
  productionRouteClass: RouteAndRunRouteClass;
  protocolMatchedRule: string;
  productionMatchedRule: string;
  protocolDepth: number;
  productionDepth: number;
  deepResearchV71: DeepResearchV71Trigger;
  taskType: string;
  orchestrationMode: string;
  latencyMs: number;
}
