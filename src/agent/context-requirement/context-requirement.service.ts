/**
 * Context Requirement Engine — facade：resolve operation → evaluate gaps → plan。
 */

import { evaluateContextRequirementPlan } from './context-gap.evaluator';
import type {
  ContextRequirementPlan,
  CreContextHints,
} from './context-requirement.types';
import {
  resolveCreOperation,
  type ResolveCreOperationInput,
} from './operation-resolver.util';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';
import { isDayLodgingChoiceQuery } from '../utils/day-lodging-choice.util';
import { isCarRentalChatCardQuery } from '../chat/build-car-rental-chat-cards.util';

export type BuildContextRequirementPlanInput = ResolveCreOperationInput & {
  hints?: CreContextHints;
};

/** 从消息粗判户外/需预订（P0 启发式，供 CONDITIONAL when） */
export function inferCreActivityFlagsFromMessage(message: string): {
  containsOutdoorActivity: boolean;
  containsReservableActivity: boolean;
} {
  const m = message ?? '';
  const containsOutdoorActivity =
    /徒步|冰川|登山|越野|露营|hiking|glacier|trek|outdoor|F-road|高地/i.test(m);
  const containsReservableActivity =
    /预订|预约|船票|门票|booking|reserve|温泉|蓝湖|蓝潟湖|船游|观光船/i.test(m);
  return { containsOutdoorActivity, containsReservableActivity };
}

/**
 * 构建请求级 ContextRequirementPlan（纯函数，无 IO）。
 */
export function buildContextRequirementPlan(
  input: BuildContextRequirementPlanInput,
): ContextRequirementPlan {
  const resolved = resolveCreOperation(input);
  const activityFlags = inferCreActivityFlagsFromMessage(input.message ?? '');
  const hints: CreContextHints = {
    message: input.message,
    tripId: input.tripId,
    focusDayIndex: input.focusDayIndex ?? resolved.target.dayIndex ?? null,
    ...activityFlags,
    destinationKnown: false,
    ...(input.hints ?? {}),
  };
  // 有 tripId 时目的地至少可从行程推导
  if (hints.tripId?.trim() && hints.destinationKnown !== true) {
    hints.destinationKnown = hints.destinationKnown ?? false;
  }
  const plan = evaluateContextRequirementPlan(resolved, hints);
  /**
   * CONSULT → ASK_TRIP_QUESTION 默认 slimLoad，会跳过 hotel / 租车 MCP。
   * 「推荐19号的酒店」「推荐租车公司」等库存检索必须关闭 slimLoad。
   */
  const msg = input.message ?? '';
  if (
    plan.acquisition.slimLoad &&
    (isHotelInventorySearchQuery(msg) ||
      isDayLodgingChoiceQuery(msg) ||
      isCarRentalChatCardQuery(msg))
  ) {
    plan.acquisition.slimLoad = false;
    plan.acquisition.skipQueryExpansion = false;
  }
  return plan;
}

/** 审计用精简 JSON（观测 / TripRun metadata） */
export function serializeCrePlanForObservability(plan: ContextRequirementPlan): Record<string, unknown> {
  return {
    operation: plan.operation,
    confidence: plan.confidence,
    executionLevel: plan.executionLevel,
    target: plan.target,
    requirements: plan.requirements.map((r) => ({
      key: r.key,
      necessity: r.necessity,
      status: r.status,
      blocking: r.blocking,
      source: r.source,
    })),
    blockingGaps: plan.blockingGaps.map((g) => g.key),
    userQuestions: plan.userQuestions,
    nextAction: plan.nextAction,
    acquisition: plan.acquisition,
    reason: plan.reason,
  };
}
