/**
 * Planning Admission Gate
 *
 * 原则：默认禁止进入 Full Planning（CLAUDE_SM / TRIP_PLANNING 全链）。
 * 仅当用户话术含明确 Plan Mutation / Replan，或局部 Repair 后显式 escalation，才放行。
 *
 * 前端 intent_mode、页面 Day 锚点、历史 ModeLock 均为 routing hint，不得单独覆盖当前用户语义。
 */

import { stripUiInjectedDayScheduleContext } from '../utils/ui-day-schedule-context.util';
import {
  detectFullTripReplanIntent,
  detectItineraryAdjustIntent,
} from '../utils/itinerary-adjust-intent.util';
import { extractUnifiedIntentSignals } from '../intent/unified-intent-signals.util';
import { resolveUnifiedIntent } from '../intent/unified-intent.resolver';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';

export type PlanningAdmissionKind =
  | 'PLAN_MUTATION'
  | 'REPLAN'
  | 'EXPLICIT_ESCALATION';

export type PlanningAdmissionDecision =
  | {
      admitted: true;
      kind: PlanningAdmissionKind;
      reason: string;
      /** 语义判定所用正文（已剥离 UI Day 锚点） */
      semanticMessage: string;
    }
  | {
      admitted: false;
      reason: string;
      semanticMessage: string;
      ignoredHints: string[];
    };

const REQUEST_ADMISSION_MARK = '__planning_admission' as const;

export type PlanningAdmissionRequestMark = {
  [REQUEST_ADMISSION_MARK]?: PlanningAdmissionDecision;
};

/** 强改稿/重排动词（不含裸「规划/安排」，避免咨询句误放行） */
function hasPlanMutationVerbSignal(msg: string, msgLower: string): boolean {
  try {
    const {
      hasReplanningEditSignalBeforeTransportConsult,
    } = require('../utils/orchestration-signals.util') as typeof import('../utils/orchestration-signals.util');
    if (hasReplanningEditSignalBeforeTransportConsult(msg, msgLower)) {
      return true;
    }
  } catch {
    /* fall through */
  }
  if (
    /(?:重新规划|重做行程|生成行程|做行程|排行程|预订行程|完善行程|完善日程)/.test(msg) ||
    /完善.{0,6}(?:行程|日程|计划)/.test(msg) ||
    /\bplan\s+a\s+(?:\w+\s+)*\d+\s*[- ]?\s*day\s+trip\b/i.test(msgLower) ||
    /\b(?:create|generate)\s+(?:a\s+)?(?:new\s+)?itinerary\b/i.test(msgLower) ||
    /\bplan\s+(?:my|the|a)\s+trip\b/i.test(msgLower)
  ) {
    return true;
  }
  return false;
}

function collectIgnoredHints(input: {
  intentModeHint?: string | null;
  entryPointHint?: string | null;
  hasDayAnchor?: boolean;
  modeLockHint?: boolean;
}): string[] {
  const hints: string[] = [];
  const mode = String(input.intentModeHint ?? '').trim().toUpperCase();
  if (mode && mode !== 'AUTO') {
    hints.push(`intent_mode:${mode}`);
  }
  if (input.entryPointHint?.trim()) {
    hints.push(`entry_point:${input.entryPointHint.trim()}`);
  }
  if (input.hasDayAnchor) {
    hints.push('ui_day_anchor');
  }
  if (input.modeLockHint) {
    hints.push('mode_lock_session');
  }
  return hints;
}

/**
 * 评估是否允许进入 Full Planning。
 * 默认 deny；Day 锚点只作上下文，不参与放行。
 */
export function evaluatePlanningAdmission(input: {
  message: string;
  tripId?: string | null;
  intentModeHint?: string | null;
  entryPointHint?: string | null;
  /** 局部 Repair 无法解决后的显式升级 */
  explicitPlanningEscalation?: boolean;
  /** 澄清续答：视为未完成规划 operation 的续程 */
  hasClarificationAnswers?: boolean;
  /** 历史 ModeLock（仅记 hint，不可单独放行） */
  modeLockHint?: boolean;
  dateRange?: { start_date?: string; end_date?: string };
}): PlanningAdmissionDecision {
  const raw = String(input.message ?? '');
  const semanticMessage = stripUiInjectedDayScheduleContext(raw).trim() || raw.trim();
  const msgLower = semanticMessage.toLowerCase();
  const hasDayAnchor = raw.includes('[日程]') && semanticMessage !== raw.trim();
  const ignoredHints = collectIgnoredHints({
    intentModeHint: input.intentModeHint,
    entryPointHint: input.entryPointHint,
    hasDayAnchor,
    modeLockHint: input.modeLockHint,
  });

  if (input.explicitPlanningEscalation) {
    return {
      admitted: true,
      kind: 'EXPLICIT_ESCALATION',
      reason: 'explicit_planning_escalation_after_local_repair',
      semanticMessage,
    };
  }

  if (input.hasClarificationAnswers) {
    return {
      admitted: true,
      kind: 'EXPLICIT_ESCALATION',
      reason: 'clarification_continuation_of_unfinished_planning_operation',
      semanticMessage,
    };
  }

  if (!semanticMessage) {
    return {
      admitted: false,
      reason: 'empty_user_semantics_default_deny_full_planning',
      semanticMessage,
      ignoredHints,
    };
  }

  if (detectFullTripReplanIntent(semanticMessage, input.dateRange)) {
    return {
      admitted: true,
      kind: 'REPLAN',
      reason: 'explicit_full_trip_replan_semantics',
      semanticMessage,
    };
  }

  if (detectItineraryAdjustIntent(semanticMessage, input.dateRange)) {
    return {
      admitted: true,
      kind: 'PLAN_MUTATION',
      reason: 'explicit_itinerary_adjust_mutation',
      semanticMessage,
    };
  }

  /** CASE-A02：Query CTA「安排住宿 / 补第N天住宿」→ 新 Adjustment task */
  if (
    Boolean(input.tripId?.trim()) &&
    /(?:帮我|请|麻烦)?(?:安排|补齐|补上|补充|完善).{0,16}住宿/.test(semanticMessage)
  ) {
    return {
      admitted: true,
      kind: 'PLAN_MUTATION',
      reason: 'lodging_fill_cta_from_query',
      semanticMessage,
    };
  }
  if (
    Boolean(input.tripId?.trim()) &&
    /(?:补|安排).{0,8}第\s*\d+\s*天.{0,12}住宿|第\s*\d+\s*天.{0,12}(?:补|安排).{0,8}住宿/.test(
      semanticMessage,
    )
  ) {
    return {
      admitted: true,
      kind: 'PLAN_MUTATION',
      reason: 'lodging_fill_day_cta_from_query',
      semanticMessage,
    };
  }

  if (hasPlanMutationVerbSignal(semanticMessage, msgLower)) {
    return {
      admitted: true,
      kind: 'PLAN_MUTATION',
      reason: 'explicit_plan_mutation_verb',
      semanticMessage,
    };
  }

  try {
    const signals = extractUnifiedIntentSignals({
      message: semanticMessage,
      tripId: input.tripId,
      entryPoint: input.entryPointHint,
    });
    const ui = resolveUnifiedIntent({
      message: semanticMessage,
      tripId: input.tripId,
      entryPoint: input.entryPointHint,
    });
    if (
      (ui.semanticIntent === 'LOCAL_EDIT' && signals.hasLocalEditAct) ||
      (ui.semanticIntent === 'GLOBAL_PLAN' && signals.hasGlobalPlanAct)
    ) {
      return {
        admitted: true,
        kind: ui.semanticIntent === 'GLOBAL_PLAN' ? 'REPLAN' : 'PLAN_MUTATION',
        reason: `unified_intent_${ui.semanticIntent.toLowerCase()}_with_act_signal`,
        semanticMessage,
      };
    }
  } catch {
    /* fall through deny */
  }

  return {
    admitted: false,
    reason: 'default_deny_full_planning_no_mutation_or_replan',
    semanticMessage,
    ignoredHints,
  };
}

export function evaluatePlanningAdmissionForRequest(
  request: Pick<
    RouteAndRunRequestDto,
    'message' | 'trip_id' | 'options' | 'clarification_answers' | 'conversation_context'
  > &
    PlanningAdmissionRequestMark,
  opts?: { modeLockHint?: boolean },
): PlanningAdmissionDecision {
  const cached = (request as PlanningAdmissionRequestMark)[REQUEST_ADMISSION_MARK];
  if (cached) return cached;

  const message = resolveRouteAndRunUserMessage(request as RouteAndRunRequestDto);
  const decision = evaluatePlanningAdmission({
    message,
    tripId: request.trip_id,
    intentModeHint: request.options?.intent_mode,
    entryPointHint: (request.options as { entry_point?: string } | undefined)?.entry_point,
    explicitPlanningEscalation:
      (request.options as { explicit_planning_escalation?: boolean } | undefined)
        ?.explicit_planning_escalation === true,
    hasClarificationAnswers: Boolean(request.clarification_answers?.length),
    modeLockHint: opts?.modeLockHint,
    dateRange: undefined,
  });
  (request as PlanningAdmissionRequestMark)[REQUEST_ADMISSION_MARK] = decision;
  return decision;
}

/**
 * 未准入：把前端误传的 TRIP_PLANNING / SM 开关降为 hint 无效，强制轻量。
 * 已准入：不改写（由下游 mutation/replan 路径处理）。
 */
export function applyPlanningAdmissionGateInPlace(
  request: RouteAndRunRequestDto & PlanningAdmissionRequestMark,
): PlanningAdmissionDecision {
  const decision = evaluatePlanningAdmissionForRequest(request);
  if (!decision.admitted) {
    request.options = {
      ...request.options,
      intent_mode: 'DATA_LOOKUP',
      use_state_machine_orchestration: false,
    };
  }
  return decision;
}

export function readPlanningAdmissionMark(
  request: PlanningAdmissionRequestMark | null | undefined,
): PlanningAdmissionDecision | undefined {
  return request?.[REQUEST_ADMISSION_MARK];
}

/**
 * 未完成规划 operation 的 ModeLock 键。
 * 仅当存在 planning_operation_id（或准入后的 request_id 续程）时锁定。
 */
export function resolvePlanningOperationLockId(input: {
  planningOperationId?: string | null;
  admitted: boolean;
  requestId?: string | null;
}): string | undefined {
  const explicit = input.planningOperationId?.trim();
  if (explicit) return explicit;
  if (input.admitted && input.requestId?.trim()) {
    return `planop:${input.requestId.trim()}`;
  }
  return undefined;
}
