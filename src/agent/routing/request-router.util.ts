/**
 * RequestRouter（纯函数）：收敛 ClaudeOrchestrator.orchestrate 首段与 SM 入口轻量 redirect。
 * 不执行编排、不写库；调用方按 decision.mode 分发。
 */

import { detectItineraryDayViewIntent } from '../utils/itinerary-day-view.util';
import { isWorkbenchAssistantPlaceholderMessage } from '../utils/trip-plan-intake-message.util';
import { isTeamStructuredDiscussionQuery } from '../utils/team-structured-discussion.util';
import {
  isBoundTripLightConsultQuery,
  shouldForceDataLookupForBoundTripReview,
  type TaskType,
} from '../utils/orchestration-signals.util';
import {
  detectDestinationRegionHint,
  extractCountryCodeFromMessage,
} from '../utils/extract-country-code-from-message.util';
import type {
  OrchestrateEntryDecision,
  ResolveOrchestrateEntryInput,
  StateMachineEntryRedirect,
} from './request-router.types';
import { resolveDecisionDepth } from '../../decision/kernel/decision-cognition.util';
import { resolveLiveRouteTakeover } from '../intent/unified-intent.execution-route';
import { evaluatePlanningAdmission } from './planning-admission-gate.util';
import {
  compileAgentTaskContract,
} from '../harness/compile-agent-task-contract.util';
import { assertFullPlanningAllowed } from '../harness/assert-task-capability.util';


/** 判别联合上 Omit 会丢掉分支字段；用宽松入参再断言即可 */
function withDecisionDepth(
  decision: { mode: OrchestrateEntryDecision['mode'] } & Record<string, unknown>,
  input: ResolveOrchestrateEntryInput,
): OrchestrateEntryDecision {
  return {
    ...decision,
    decisionDepth: resolveDecisionDepth({
      routingTaskType: input.routingTaskType,
      orchestrateMode: decision.mode,
      message: input.message,
    }),
  } as OrchestrateEntryDecision;
}

const LIGHT_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  'DATA_LOOKUP',
  'GENERIC_QA',
  'RAG_QA',
]);

/**
 * 新建行程「真规划」意图：避免「trip planning tips」等泛咨询被硬拒到 NEED_DESTINATION。
 * 要求：规划/行程类动词，且带天数或出游/目的地线索；或显式「帮我规划行程」。
 */
export function isPlanningIntentMessage(message: string): boolean {
  const raw = String(message ?? '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  /** 纯 tips/how-to 咨询：不进缺国家硬澄清 */
  if (
    /\b(tips?|how\s+to|advice|guide)\b/i.test(lower) &&
    !/\d+\s*(?:day|days|天|日)/i.test(lower) &&
    !/(?:去|到|玩|旅游|旅行|visit|travel\s+to)\s+\S+/i.test(raw)
  ) {
    return false;
  }

  const hasPlanVerb =
    /规划|计划|行程|安排|自驾|环岛|itinerary|\btrip\b|\bplan\b|road\s*trip/i.test(raw);
  if (!hasPlanVerb) return false;

  const hasDaySpan = /\d+\s*(?:天|日|days?)\b/i.test(raw);
  const hasTravelCue =
    /去|玩|旅游|旅行|自驾|环岛|road\s*trip|visit|travel|itinerary|行程/i.test(raw);
  const hasExplicitPlanAsk =
    /(?:帮我|请)?(?:规划|安排|设计).{0,24}(?:行程|路线|itinerary)|(?:规划|安排).{0,12}(?:天|日)/i.test(
      raw,
    );

  return hasDaySpan || hasTravelCue || hasExplicitPlanAsk;
}

/**
 * 解析 orchestrate() 入口应走哪条路径（与历史 early-return 顺序一致）。
 */
export function resolveOrchestrateEntry(
  input: ResolveOrchestrateEntryInput,
): OrchestrateEntryDecision {
  const message = input.message ?? '';
  const teamMsg = (input.resolvedUserMessage ?? message).trim() || message;
  const boundTripId = (input.tripId ?? '').trim();
  const rt = input.routingTaskType;
  const extractCountry =
    input.extractCountryCode ?? extractCountryCodeFromMessage;

  if (boundTripId && detectItineraryDayViewIntent(message)) {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'itinerary_day_view',
        reason: 'bound_trip_day_view',
        tracePath: 'LIGHTWEIGHT',
      },
      input,
    );
  }

  if (boundTripId && isWorkbenchAssistantPlaceholderMessage(message)) {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'workbench_placeholder',
        reason: 'workbench_assistant_placeholder',
        tracePath: 'LIGHTWEIGHT',
      },
      input,
    );
  }

  if (isTeamStructuredDiscussionQuery(teamMsg)) {
    return withDecisionDepth(
      {
        mode: 'TEAM_STRUCTURED_DISCUSSION',
        reason: 'team_structured_discussion',
        tracePath: 'TEAM_BYPASS',
        userMessage: teamMsg,
      },
      input,
    );
  }

  /**
   * P2–P5：统一意图接管（CONSULT / ASSESS / LOCAL_EDIT / GLOBAL_PLAN）。
   * P5：删除 weather / itinerary-adjust keyword 兜底；低置信场景靠信号扩面 + mislabel 安全网。
   * Admission Gate：无 mutation/replan/escalation 时禁止进入 PLANNING_STATE_MACHINE。
   */
  const admission = evaluatePlanningAdmission({
    message: teamMsg || message,
    tripId: boundTripId || null,
  });
  const taskContract = compileAgentTaskContract({
    message: teamMsg || message,
    turnId: 'orchestrate_entry',
    tripId: boundTripId || null,
  });
  const liveTakeover = resolveLiveRouteTakeover({
    message: teamMsg || message,
    tripId: boundTripId || null,
  });
  if (liveTakeover?.kind === 'CONSULT') {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'knowledge_query',
        reason: liveTakeover.reason,
        tracePath: 'LIGHTWEIGHT',
        patchOptions: {
          intent_mode: 'DATA_LOOKUP',
          use_state_machine_orchestration: false,
        },
      },
      input,
    );
  }
  /**
   * ASSESS_IMPACT：只读影响判定也要进 SM 认知链，不得被 admission deny / 轻量 taskType 短路。
   * （mutation 仍走下方 admission；此处不要求 plan_mutation admit）
   */
  if (liveTakeover?.kind === 'ASSESS_IMPACT' && boundTripId) {
    return withDecisionDepth(
      {
        mode: 'PLANNING_STATE_MACHINE',
        entry: 'bound_trip_planning',
        reason: liveTakeover.reason,
        tracePath: 'STATE_MACHINE',
        suggestedDeadlineMs: 120_000,
      },
      input,
    );
  }
  /**
   * TaskContract / Admission deny：仅拦截本会进入 PLANNING_STATE_MACHINE 的路径。
   */
  const planningGuard = assertFullPlanningAllowed(taskContract);
  if (
    planningGuard.ok === false &&
    boundTripId &&
    (!rt || rt === 'TRIP_PLANNING' || rt === 'BOOKING_WORKFLOW')
  ) {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'knowledge_query',
        reason: `task_contract_guard:${planningGuard.reason}`,
        tracePath: 'LIGHTWEIGHT',
        patchOptions: {
          intent_mode: 'DATA_LOOKUP',
          use_state_machine_orchestration: false,
        },
      },
      input,
    );
  }
  if (
    !admission.admitted &&
    boundTripId &&
    (!rt || rt === 'TRIP_PLANNING' || rt === 'BOOKING_WORKFLOW')
  ) {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'knowledge_query',
        reason: `planning_admission_denied:${admission.reason}`,
        tracePath: 'LIGHTWEIGHT',
        patchOptions: {
          intent_mode: 'DATA_LOOKUP',
          use_state_machine_orchestration: false,
        },
      },
      input,
    );
  }
  if (admission.admitted && liveTakeover?.kind === 'LOCAL_EDIT' && boundTripId) {
    return withDecisionDepth(
      {
        mode: 'PLANNING_STATE_MACHINE',
        entry: liveTakeover.smEntry,
        reason: liveTakeover.reason,
        tracePath: 'STATE_MACHINE',
        suggestedDeadlineMs: 120_000,
      },
      input,
    );
  }
  if (admission.admitted && liveTakeover?.kind === 'GLOBAL_PLAN' && boundTripId) {
    return withDecisionDepth(
      {
        mode: 'PLANNING_STATE_MACHINE',
        entry: liveTakeover.smEntry,
        reason: liveTakeover.reason,
        tracePath: 'STATE_MACHINE',
        suggestedDeadlineMs: 120_000,
      },
      input,
    );
  }

  const msgLower = message.trim().toLowerCase();

  if (rt && LIGHT_TASK_TYPES.has(rt)) {
    return withDecisionDepth(
      {
        mode: 'LIGHTWEIGHT',
        handler: 'knowledge_query',
        reason: `routing_task_type_${rt}`,
        tracePath: 'LIGHTWEIGHT',
      },
      input,
    );
  }

  if (boundTripId && rt === 'TRIP_PLANNING') {
    if (
      !admission.admitted ||
      isBoundTripLightConsultQuery(message, msgLower) ||
      shouldForceDataLookupForBoundTripReview({
        trip_id: boundTripId,
        message,
      })
    ) {
      return withDecisionDepth(
        {
          mode: 'LIGHTWEIGHT',
          handler: 'knowledge_query',
          reason: !admission.admitted
            ? `planning_admission_denied:${admission.reason}`
            : 'bound_trip_planning_mislabel_light_consult',
          tracePath: 'LIGHTWEIGHT',
          patchOptions: {
            intent_mode: 'DATA_LOOKUP',
            use_state_machine_orchestration: false,
          },
        },
        input,
      );
    }
    return withDecisionDepth(
      {
        mode: 'PLANNING_STATE_MACHINE',
        entry: 'bound_trip_planning',
        reason: 'bound_trip_trip_planning',
        tracePath: 'STATE_MACHINE',
        suggestedDeadlineMs: 120_000,
      },
      input,
    );
  }

  const isCreatingNewTrip = !boundTripId;
  if (isCreatingNewTrip && isPlanningIntentMessage(message)) {
    const countryCode = extractCountry(message);
    if (countryCode) {
      return withDecisionDepth(
        {
          mode: 'PLANNING_STATE_MACHINE',
          entry: 'new_trip_with_country',
          reason: `new_trip_country_${countryCode}`,
          tracePath: 'STATE_MACHINE',
          suggestedDeadlineMs: 60_000,
          countryCode,
        },
        input,
      );
    }
    const region = detectDestinationRegionHint(message);
    return withDecisionDepth(
      {
        mode: 'NEED_DESTINATION_COUNTRY',
        reason: region
          ? 'new_trip_region_needs_country'
          : 'new_trip_missing_country_code',
        tracePath: 'CLAUDE_DYNAMIC',
        ...(region?.regionCode ? { regionCode: region.regionCode } : {}),
      },
      input,
    );
  }

  return withDecisionDepth(
    {
      mode: 'DYNAMIC_DAG',
      reason: 'default_claude_dynamic',
      tracePath: 'CLAUDE_DYNAMIC',
    },
    input,
  );
}

/**
 * CLAUDE_SM 入口：TaskContract / Admission Gate 默认拒绝 Full Planning；
 * CONSULT → 轻量；仅 mutation/replan/escalation 且 capability 允许时留在 SM。
 */
export function resolveStateMachineEntryRedirect(input: {
  tripId?: string | null;
  message?: string | null;
  routingTaskType?: TaskType;
  /** 若入口已编译 TaskContract，优先使用 */
  taskContract?: import('../harness/agent-task-contract.types').AgentTaskContractV1 | null;
}): StateMachineEntryRedirect {
  const rt = input.routingTaskType ?? 'TRIP_PLANNING';
  const message = String(input.message ?? '');
  const contract =
    input.taskContract ??
    compileAgentTaskContract({
      message,
      turnId: 'sm_entry',
      tripId: input.tripId,
    });
  const planningGuard = assertFullPlanningAllowed(contract);
  if (planningGuard.ok === false) {
    return {
      redirect: true,
      to: 'CLAUDE_DYNAMIC_LIGHT',
      reason: `task_contract_guard:${planningGuard.reason}`,
      routingTaskType: LIGHT_TASK_TYPES.has(rt) ? rt : 'DATA_LOOKUP',
    };
  }

  const admission = evaluatePlanningAdmission({
    message,
    tripId: input.tripId,
  });
  if (!admission.admitted) {
    return {
      redirect: true,
      to: 'CLAUDE_DYNAMIC_LIGHT',
      reason: `planning_admission_denied:${admission.reason}`,
      routingTaskType: LIGHT_TASK_TYPES.has(rt) ? rt : 'DATA_LOOKUP',
    };
  }

  const liveTakeover = resolveLiveRouteTakeover({
    message,
    tripId: input.tripId,
  });
  if (liveTakeover?.kind === 'CONSULT') {
    return {
      redirect: true,
      to: 'CLAUDE_DYNAMIC_LIGHT',
      reason: liveTakeover.reason,
      routingTaskType: 'DATA_LOOKUP',
    };
  }
  if (liveTakeover?.kind === 'LOCAL_EDIT' || liveTakeover?.kind === 'ASSESS_IMPACT') {
    return {
      redirect: false,
      reason: liveTakeover.reason,
    };
  }
  if (liveTakeover?.kind === 'GLOBAL_PLAN') {
    return {
      redirect: false,
      reason: liveTakeover.reason,
    };
  }
  if (LIGHT_TASK_TYPES.has(rt)) {
    return {
      redirect: true,
      to: 'CLAUDE_DYNAMIC_LIGHT',
      reason: `sm_entry_light_task_${rt}`,
      routingTaskType: rt,
    };
  }
  if (
    input.tripId?.trim() &&
    isWorkbenchAssistantPlaceholderMessage(input.message)
  ) {
    return {
      redirect: true,
      to: 'WORKBENCH_PLACEHOLDER',
      reason: 'sm_entry_workbench_placeholder',
    };
  }
  return { redirect: false, reason: 'sm_entry_continue' };
}
