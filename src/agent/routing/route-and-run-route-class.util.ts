/**
 * route_and_run 产品级路由分类 — 决策树 SSOT（与 ROUTE_AND_RUN_ROUTING_PROTOCOL.md 对齐）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { matchesAnyDataLookupProfile, matchesCrudProfile } from '../intent/intent-profile-registry';
import { analyzeRouteAndRunIntent } from '../utils/route-and-run-intent-analyzer.util';
import { detectItineraryDayViewIntent } from '../utils/itinerary-day-view.util';
import { signalsFromRequest, type RoutingSignals } from '../utils/orchestration-signals.util';
import type {
  DeepResearchV71Trigger,
  OrchestrationDepth,
  RouteAndRunRouteClass,
  RouteAndRunRouteClassDecision,
  TripIdRequirement,
} from './route-and-run-routing-protocol.types';

const CONDITIONAL_BRANCH_RE =
  /如果.{2,48}(就|则|便|改|换|去)|赶不上.{0,24}(改|换|去|Plan\s*B)|否则.{0,16}(改|换)|Plan\s*B/i;

export function detectConditionalBranchIntent(message: string): boolean {
  return CONDITIONAL_BRANCH_RE.test(String(message ?? ''));
}

const EXPLICIT_PLAN_RE =
  /规划|排(个|一)?行程|帮我(做|排|规划)|plan\s+a\s+(?:\d|\w+\s+day|\w+\s+trip)|\d+\s*[- ]?\s*day\s+trip|天游|环岛|itinerary/i;

const CONSULTATION_FACT_RE =
  /什么是|什么叫|what is |提前多久|开放吗|营业时间|几点开|几点关|门票.*多久/i;

const REPLAN_MUTATION_RE =
  /轻松|少排|太赶|挪到|改到第|调整|改线|错开|合规|能走吗|不要改|仍按|坚持|暴风雪|重新规划|推翻重来/i;

const HIGH_RISK_SAFETY_RE =
  /退款|chargeback|dispute|投诉/i;

function hasTripId(request: RouteAndRunRequestDto): boolean {
  return Boolean(request.trip_id?.trim());
}

function detectConditionalBranch(message: string): boolean {
  return detectConditionalBranchIntent(message);
}

function isConsultationQuickAnswer(message: string, signals: RoutingSignals): boolean {
  const msg = String(message ?? '');
  if (matchesAnyDataLookupProfile(msg)) return true;
  if (detectItineraryDayViewIntent(msg)) return true;
  if (CONSULTATION_FACT_RE.test(msg)) return true;
  if (
    signals.taskType === 'DATA_LOOKUP' ||
    signals.taskType === 'GENERIC_QA' ||
    signals.taskType === 'RAG_QA'
  ) {
    return true;
  }
  return false;
}

function isExplicitPlanning(
  message: string,
  signals: RoutingSignals,
  intentPrimary: ReturnType<typeof analyzeRouteAndRunIntent>['primary'],
): boolean {
  if (EXPLICIT_PLAN_RE.test(message)) return true;
  if (intentPrimary === 'GENERAL_PLAN' && !isConsultationQuickAnswer(message, signals)) {
    return true;
  }
  if (intentPrimary === 'GENERAL_PLAN' && /推翻重来|重新规划|整单|全部重/i.test(message)) {
    return true;
  }
  if (isConsultationQuickAnswer(message, signals)) {
    return false;
  }
  if (intentPrimary === 'GENERAL_PLAN') return true;
  if (signals.taskType === 'TRIP_PLANNING') {
    return true;
  }
  return false;
}

function isReplanMutation(
  message: string,
  intentPrimary: ReturnType<typeof analyzeRouteAndRunIntent>['primary'],
): boolean {
  const msg = String(message ?? '');
  if (/推翻重来|重新规划整个|整单重|全部重/i.test(msg)) {
    return false;
  }
  if (intentPrimary === 'ITINERARY_ADJUST' || intentPrimary === 'SKU_SHORT_CIRCUIT') {
    return true;
  }
  return REPLAN_MUTATION_RE.test(msg);
}

function detectDeepResearchV71(
  message: string,
  sub: ReturnType<typeof analyzeRouteAndRunIntent>['sub_signals'],
  routeClass: RouteAndRunRouteClass,
): DeepResearchV71Trigger {
  if (routeClass === 'QUICK_ANSWER' || routeClass === 'CRUD_EDIT') {
    return 'OFF';
  }
  const nl = String(message ?? '');
  const policyHeavy =
    /签证|入境|海关|政策变化|供应商|库存|封路|路况|安全规则|门票规则|seasonal\s+closure/i.test(nl);
  const complexDestination =
    routeClass === 'FULL_DEEP_PLAN' &&
    /(7|8|9|10|11|12|13|14)\s*天|环岛|多国|multi.country|first.time|冰岛|iceland/i.test(nl);

  if (complexDestination && policyHeavy) return 'REQUIRED';
  if (
    sub.peak_season_crowd_avoidance ||
    sub.froad_2wd_compliance ||
    policyHeavy ||
    /西峡湾|高地|highland|F\s*\d+|旺季|peak\s+season|七月|高峰|错开|冰岛|iceland/i.test(nl)
  ) {
    return 'ELIGIBLE';
  }
  return 'OFF';
}

function orchestrationDepthFor(
  routeClass: RouteAndRunRouteClass,
  deep: DeepResearchV71Trigger,
): OrchestrationDepth {
  switch (routeClass) {
    case 'QUICK_ANSWER':
      return 'LIGHT_LOOKUP';
    case 'CRUD_EDIT':
      return 'NONE';
    case 'PARTIAL_REPLAN':
    case 'SLOT_PLACEMENT_CLARIFY':
    case 'CONDITIONAL_BRANCH':
      return 'PLAN_VERIFY_PARTIAL';
    case 'FULL_DEEP_PLAN':
      return deep === 'REQUIRED' ? 'FULL_CHAIN' : 'FULL_CHAIN';
    case 'SAFETY_CONSENT_OR_BLOCK':
      return 'LIGHT_LOOKUP';
    default:
      return 'FULL_CHAIN';
  }
}

function pack(
  routeClass: RouteAndRunRouteClass,
  tripId: TripIdRequirement,
  needsClarificationBeforeWrite: boolean,
  allowsDirectItineraryWrite: boolean,
  deepResearchV71: DeepResearchV71Trigger,
  orchestrationDepth: OrchestrationDepth,
  asyncEligible: boolean,
  matchedRule: string,
  message: string,
  sub: ReturnType<typeof analyzeRouteAndRunIntent>['sub_signals'],
): RouteAndRunRouteClassDecision {
  const deep =
    routeClass === 'QUICK_ANSWER' ||
    routeClass === 'CRUD_EDIT' ||
    routeClass === 'SAFETY_CONSENT_OR_BLOCK'
      ? 'OFF'
      : deepResearchV71 === 'OFF'
        ? detectDeepResearchV71(message, sub, routeClass)
        : deepResearchV71;
  return {
    routeClass,
    tripId,
    needsClarificationBeforeWrite,
    allowsDirectItineraryWrite,
    deepResearchV71: deep,
    orchestrationDepth: orchestrationDepthFor(routeClass, deep),
    asyncEligible,
    matchedRule,
  };
}

/**
 * 产品路由决策树（优先级自上而下）。
 */
export function classifyRouteAndRunRouteClass(
  request: RouteAndRunRequestDto,
): RouteAndRunRouteClassDecision {
  const msg = String(request.message ?? '');
  const tripBound = hasTripId(request);
  const signals = signalsFromRequest(request);
  const intent = analyzeRouteAndRunIntent(msg, {
    tripId: request.trip_id,
    hasTripDays: tripBound,
  });

  const asyncEligible =
    (request.options?.max_seconds ?? 30) >= 45 ||
    String(request.options?.async_mode ?? 'OFF').toUpperCase() !== 'OFF' ||
    signals.complexity === 'COMPLEX';

  // 1. 安全 / consent
  if (
    signals.risk === 'CRITICAL' ||
    signals.risk === 'HIGH' ||
    (HIGH_RISK_SAFETY_RE.test(msg) && /支付|payment|凭证|信用卡/i.test(msg)) ||
    HIGH_RISK_SAFETY_RE.test(msg) ||
    (signals.taskType === 'BOOKING_WORKFLOW' && /支付|信用卡|护照|passport|payment/i.test(msg))
  ) {
    return pack(
      'SAFETY_CONSENT_OR_BLOCK',
      tripBound ? 'optional' : 'none',
      false,
      false,
      'OFF',
      'LIGHT_LOOKUP',
      asyncEligible,
      'risk_or_consent',
      msg,
      intent.sub_signals,
    );
  }

  // 2. CRUD（须 trip_id）
  if (tripBound && matchesCrudProfile(msg)) {
    return pack(
      'CRUD_EDIT',
      'required',
      false,
      true,
      'OFF',
      'NONE',
      false,
      'crud_profile',
      msg,
      intent.sub_signals,
    );
  }

  // 3. 槽位放置 → 先澄清
  if (intent.primary === 'ITINERARY_SLOT_PLACEMENT') {
    return pack(
      'SLOT_PLACEMENT_CLARIFY',
      'required',
      true,
      false,
      'OFF',
      'PLAN_VERIFY_PARTIAL',
      asyncEligible,
      'slot_placement',
      msg,
      intent.sub_signals,
    );
  }

  // 4. 条件分支（优先于快答/重排）
  if (detectConditionalBranch(msg)) {
    return pack(
      'CONDITIONAL_BRANCH',
      tripBound ? 'required' : 'optional',
      false,
      false,
      'OFF',
      'PLAN_VERIFY_PARTIAL',
      asyncEligible,
      'conditional_branch',
      msg,
      intent.sub_signals,
    );
  }

  // 5. 局部重排（优先于咨询快答）
  if (tripBound && isReplanMutation(msg, intent.primary)) {
    const gateBlocksWrite = /不要改|仍按原|坚持/i.test(msg);
    return pack(
      'PARTIAL_REPLAN',
      'required',
      false,
      !gateBlocksWrite,
      detectDeepResearchV71(msg, intent.sub_signals, 'PARTIAL_REPLAN'),
      'PLAN_VERIFY_PARTIAL',
      asyncEligible,
      'partial_replan',
      msg,
      intent.sub_signals,
    );
  }

  // 6. 快答
  if (
    isConsultationQuickAnswer(msg, signals) &&
    !isExplicitPlanning(msg, signals, intent.primary)
  ) {
    return pack(
      'QUICK_ANSWER',
      tripBound ? 'optional' : 'none',
      false,
      false,
      'OFF',
      'LIGHT_LOOKUP',
      false,
      'consultation_quick',
      msg,
      intent.sub_signals,
    );
  }

  // 7. 完整深规划
  if (isExplicitPlanning(msg, signals, intent.primary)) {
    return pack(
      'FULL_DEEP_PLAN',
      tripBound ? 'optional' : 'none',
      !tripBound && /几天|多少天|日期|when|how many days/i.test(msg),
      false,
      detectDeepResearchV71(msg, intent.sub_signals, 'FULL_DEEP_PLAN'),
      'FULL_CHAIN',
      asyncEligible,
      'full_deep_plan',
      msg,
      intent.sub_signals,
    );
  }

  // 8. 默认快答
  return pack(
    'QUICK_ANSWER',
    tripBound ? 'optional' : 'none',
    false,
    false,
    'OFF',
    'LIGHT_LOOKUP',
    false,
    'default_quick',
    msg,
    intent.sub_signals,
  );
}
