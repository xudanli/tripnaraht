/**
 * Production-side route class proxy (current runtime signals path) vs protocol SSOT.
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import type { RoutingSignals } from '../utils/orchestration-signals.util';
import { matchesAnyDataLookupProfile, matchesCrudProfile } from '../intent/intent-profile-registry';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import { detectItineraryAdjustIntent, detectFullTripReplanIntent } from '../utils/itinerary-adjust-intent.util';
import { projectProductionRoutingTier } from './routing-tier-projection.util';
import { detectConditionalBranchIntent } from './route-and-run-route-class.util';
import {
  isRouteClassForkEnabled,
  readRouteClassDecisionFromRequest,
} from './route-and-run-route-class-fork.util';
import type { RouteAndRunRouteClass, RouteAndRunRouteClassDecision } from './route-and-run-routing-protocol.types';

export type RouteClassDriftType = 'NONE' | 'OVER_DEPTH' | 'UNDER_DEPTH' | 'CLASS_MISMATCH';

const ROUTE_CLASS_DEPTH: Record<RouteAndRunRouteClass, number> = {
  QUICK_ANSWER: 1,
  CRUD_EDIT: 2,
  SLOT_PLACEMENT_CLARIFY: 2,
  SAFETY_CONSENT_OR_BLOCK: 2,
  CONDITIONAL_BRANCH: 3,
  PARTIAL_REPLAN: 4,
  FULL_DEEP_PLAN: 5,
};

function isSafetyRouteClass(signals: RoutingSignals, msg: string): boolean {
  if (signals.risk === 'CRITICAL') {
    return true;
  }
  if (
    signals.risk === 'HIGH' &&
    (signals.taskType === 'BOOKING_WORKFLOW' || /退款|refund|chargeback|投诉/i.test(msg))
  ) {
    return true;
  }
  if (signals.taskType === 'BOOKING_WORKFLOW' && /支付|信用卡|护照|passport|payment/i.test(msg)) {
    return true;
  }
  return false;
}

function isPartialReplanSignals(
  msg: string,
  intentPrimary: ReturnType<typeof analyzeRouteAndRunIntent>['primary'],
): boolean {
  if (intentPrimary === 'ITINERARY_ADJUST' || intentPrimary === 'SKU_SHORT_CIRCUIT') {
    return true;
  }
  if (detectItineraryAdjustIntent(msg)) {
    return true;
  }
  if (/轻松|少排|太赶|挪到|改到第|调整|改线|错开|合规|能走吗|不要改|仍按|坚持|暴风雪/i.test(msg)) {
    return true;
  }
  if (detectFullTripReplanIntent(msg)) {
    return false;
  }
  return false;
}

/**
 * 近似「当前生产路由」会走的 path（signals + taskType + intent）。
 * 与 `classifyRouteAndRunRouteClass`（协议 SSOT）对比用于 shadow drift。
 */
export function inferProductionRouteClassProxy(
  request: RouteAndRunRequestDto,
  signals: RoutingSignals,
  decision: OrchestrationPolicyDecision,
): RouteAndRunRouteClassDecision {
  const forkDecision = readRouteClassDecisionFromRequest(request);
  if (forkDecision && isRouteClassForkEnabled()) {
    return {
      ...forkDecision,
      matchedRule: `route_class_fork:${forkDecision.matchedRule}`,
    };
  }

  const msg = String(request.message ?? '');
  const tripBound = Boolean(request.trip_id?.trim());
  const intent = analyzeRouteAndRunIntent(msg, {
    tripId: request.trip_id,
    hasTripDays: tripBound,
  });
  const tier = projectProductionRoutingTier(signals, decision);
  const asyncEligible =
    (request.options?.max_seconds ?? 30) >= 45 ||
    String(request.options?.async_mode ?? 'OFF').toUpperCase() !== 'OFF';

  if (isSafetyRouteClass(signals, msg)) {
    return proxyDecision('SAFETY_CONSENT_OR_BLOCK', 'production_safety', tripBound, asyncEligible);
  }

  if (tripBound && matchesCrudProfile(msg)) {
    return proxyDecision('CRUD_EDIT', 'production_crud', true, false, true);
  }

  if (intent.primary === 'ITINERARY_SLOT_PLACEMENT') {
    return proxyDecision('SLOT_PLACEMENT_CLARIFY', 'production_slot', true, asyncEligible, false, true);
  }

  if (detectConditionalBranchIntent(msg)) {
    return proxyDecision('CONDITIONAL_BRANCH', 'production_conditional', tripBound, asyncEligible);
  }

  if (tripBound && isPartialReplanSignals(msg, intent.primary)) {
    const gateBlocksWrite = /不要改|仍按原|坚持/i.test(msg);
    return proxyDecision(
      'PARTIAL_REPLAN',
      'production_partial',
      true,
      asyncEligible,
      !gateBlocksWrite,
    );
  }

  if (
    signals.taskType === 'DATA_LOOKUP' ||
    matchesAnyDataLookupProfile(msg) ||
    tier === 'SYSTEM1_API' ||
    tier === 'SYSTEM1_RAG'
  ) {
    if (!(signals.taskType === 'TRIP_PLANNING' && signals.requiresStructuredOutput)) {
      return proxyDecision('QUICK_ANSWER', 'production_system1', tripBound, false);
    }
  }

  if (
    signals.taskType === 'TRIP_PLANNING' ||
    signals.taskType === 'BOOKING_WORKFLOW' ||
    tier === 'SYSTEM2_REASONING'
  ) {
    if (detectFullTripReplanIntent(msg) || /推翻重来|重新规划整个|整单重/i.test(msg)) {
      return proxyDecision('FULL_DEEP_PLAN', 'production_full_replan', tripBound, asyncEligible);
    }
    return proxyDecision('FULL_DEEP_PLAN', 'production_system2_plan', tripBound, asyncEligible);
  }

  if (tier === 'SYSTEM2_CONSENT') {
    return proxyDecision('SAFETY_CONSENT_OR_BLOCK', 'production_system2_consent', tripBound, asyncEligible);
  }

  return proxyDecision('QUICK_ANSWER', 'production_default', tripBound, false);
}

function proxyDecision(
  routeClass: RouteAndRunRouteClass,
  matchedRule: string,
  tripBound: boolean,
  asyncEligible: boolean,
  allowsDirectItineraryWrite = false,
  needsClarificationBeforeWrite = false,
): RouteAndRunRouteClassDecision {
  return {
    routeClass,
    tripId: tripBound ? 'required' : 'none',
    needsClarificationBeforeWrite,
    allowsDirectItineraryWrite,
    deepResearchV71: 'OFF',
    orchestrationDepth:
      routeClass === 'QUICK_ANSWER' || routeClass === 'SAFETY_CONSENT_OR_BLOCK'
        ? 'LIGHT_LOOKUP'
        : routeClass === 'CRUD_EDIT'
          ? 'NONE'
          : routeClass === 'FULL_DEEP_PLAN'
            ? 'FULL_CHAIN'
            : 'PLAN_VERIFY_PARTIAL',
    asyncEligible,
    matchedRule,
  };
}

export function analyzeRouteClassDrift(
  protocol: RouteAndRunRouteClass,
  production: RouteAndRunRouteClass,
): RouteClassDriftType {
  if (protocol === production) {
    return 'NONE';
  }
  const pDepth = ROUTE_CLASS_DEPTH[protocol] ?? 0;
  const rDepth = ROUTE_CLASS_DEPTH[production] ?? 0;
  if (rDepth > pDepth) {
    return 'OVER_DEPTH';
  }
  if (rDepth < pDepth) {
    return 'UNDER_DEPTH';
  }
  return 'CLASS_MISMATCH';
}

export function routeClassDepth(routeClass: RouteAndRunRouteClass): number {
  return ROUTE_CLASS_DEPTH[routeClass] ?? 0;
}
