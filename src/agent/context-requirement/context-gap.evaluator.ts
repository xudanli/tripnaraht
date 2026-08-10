/**
 * Context Requirement Engine — Gap Evaluator + Acquisition flags（P0）。
 */

import {
  expandCreContractFields,
  getCreContextContract,
} from './context-contract.registry';
import type {
  ContextRequirementPlan,
  CreAcquisitionFlags,
  CreContextHints,
  CreFactStatus,
  CreNextAction,
  CreResolvedRequirement,
} from './context-requirement.types';
import type { CreOperationResolveResult } from './context-requirement.types';
import { isCreAnswerOnlyOperation } from './operation-resolver.util';

function evalWhenTrue(when: string | undefined, hints: CreContextHints): boolean {
  if (!when) return true;
  if (when === "travelMode === 'SELF_DRIVE'") return hints.travelMode === 'SELF_DRIVE';
  if (when === 'containsOutdoorActivity === true') return hints.containsOutdoorActivity === true;
  if (when === 'containsReservableActivity === true') {
    return hints.containsReservableActivity === true;
  }
  return true;
}

function statusForKey(key: string, hints: CreContextHints): CreFactStatus {
  switch (key) {
    case 'user.message':
      return hints.message?.trim() ? 'AVAILABLE' : 'BLOCKING';
    case 'trip.id':
      return hints.tripId?.trim() ? 'AVAILABLE' : 'BLOCKING';
    case 'trip.destination':
      if (hints.destinationKnown) return 'AVAILABLE';
      if (hints.tripId?.trim()) return 'DERIVABLE';
      return 'USER_REQUIRED';
    case 'page.focusDay':
      if (hints.focusDayIndex != null && hints.focusDayIndex > 0) return 'AVAILABLE';
      if (hints.tripId?.trim()) return 'DERIVABLE';
      return 'OPTIONAL';
    case 'targetDay.date':
    case 'sourceDay.date':
      /** 改行程必须知道目标日；仅有 tripId 不能推导「加到哪一天」 */
      if (hints.focusDayIndex != null && hints.focusDayIndex > 0) return 'AVAILABLE';
      /**
       * 「明天/今天天气会影响行程吗」：相对日可由行程日历 FETCH，勿 CRE ASK 卡死观察。
       */
      if (
        hints.tripId?.trim() &&
        /今天|今日|明天|明日|后天|大后天|\btoday\b|\btomorrow\b/i.test(hints.message ?? '')
      ) {
        return 'FETCHABLE';
      }
      return 'USER_REQUIRED';
    case 'targetDay.activities':
    case 'trip.remainingDays':
      if (hints.hasDayPlan) return 'AVAILABLE';
      if (hints.tripId?.trim()) return 'FETCHABLE';
      return 'BLOCKING';
    case 'targetDay.accommodation':
    case 'accommodation.candidate':
      if (hints.hasAccommodationOnTargetDay) return 'AVAILABLE';
      if (hints.tripId?.trim()) return 'FETCHABLE';
      return 'UNCERTAIN';
    case 'participants':
    case 'participants.fitnessProfile':
      if (hints.hasParticipants) return 'AVAILABLE';
      if (hints.tripId?.trim()) return 'FETCHABLE';
      return 'USER_REQUIRED';
    case 'travelMode':
      return hints.travelMode ? 'AVAILABLE' : hints.tripId?.trim() ? 'DERIVABLE' : 'OPTIONAL';
    case 'vehicle.profile':
      if (hints.hasVehicleProfile) return 'AVAILABLE';
      return 'USER_REQUIRED';
    case 'roadConditions':
      if (hints.hasRoadStatus) return 'AVAILABLE';
      return 'FETCHABLE';
    case 'weather.forecast':
      if (hints.hasWeather) return 'AVAILABLE';
      return 'FETCHABLE';
    case 'experience.product':
    case 'booking.availability':
      if (hints.hasExperienceProduct) return 'AVAILABLE';
      return 'FETCHABLE';
    case 'activity.ref':
    case 'options.candidates':
    case 'risk.trigger':
    case 'booking.artifact':
      return hints.message?.trim() ? 'DERIVABLE' : 'USER_REQUIRED';
    case 'routeTravelTimes':
      return 'DERIVABLE';
    case 'user.diningPreferences':
    case 'user.pacePreference':
    case 'trip.partySize':
    case 'booking.targetRef':
      return 'OPTIONAL';
    default:
      return 'UNCERTAIN';
  }
}

function toBlockingStatus(
  status: CreFactStatus,
  fieldBlocking: boolean | undefined,
  necessity: string,
): { status: CreFactStatus; blocking: boolean } {
  /** 合同显式 `blocking` 优先；未声明时 REQUIRED/APPLY_REQUIRED 默认阻断 */
  const wantsBlock =
    fieldBlocking !== undefined
      ? fieldBlocking === true
      : necessity === 'REQUIRED' || necessity === 'APPLY_REQUIRED';
  if (!wantsBlock) {
    if (status === 'USER_REQUIRED' || status === 'BLOCKING') {
      return { status: necessity === 'OPTIONAL' ? 'OPTIONAL' : status, blocking: false };
    }
    return { status, blocking: false };
  }
  if (
    status === 'AVAILABLE' ||
    status === 'DERIVABLE' ||
    status === 'FETCHABLE' ||
    status === 'OPTIONAL'
  ) {
    return { status, blocking: false };
  }
  if (status === 'STALE' || status === 'UNCERTAIN') {
    return { status, blocking: false };
  }
  return { status: status === 'USER_REQUIRED' ? 'USER_REQUIRED' : 'BLOCKING', blocking: true };
}

function questionForGap(req: CreResolvedRequirement): string {
  const label = req.labelZh || req.key;
  return `还需要确认：${label}？`;
}

function buildAcquisitionFlags(
  operation: CreOperationResolveResult['operation'],
  requirements: CreResolvedRequirement[],
): CreAcquisitionFlags {
  const answerOnly = isCreAnswerOnlyOperation(operation);
  const fetchKeys = requirements
    .filter((r) => r.status === 'FETCHABLE')
    .map((r) => r.key);
  return {
    slimLoad: answerOnly,
    skipQueryExpansion: answerOnly,
    skipRisksRag: operation === 'ASK_TRIP_QUESTION',
    fetchKeys,
  };
}

function resolveNextAction(
  operation: CreOperationResolveResult['operation'],
  blockingGaps: CreResolvedRequirement[],
  requirements: CreResolvedRequirement[],
): CreNextAction {
  if (blockingGaps.some((g) => g.status === 'USER_REQUIRED' || g.status === 'BLOCKING')) {
    return 'ASK_USER';
  }
  if (requirements.some((r) => r.status === 'FETCHABLE')) {
    return isCreAnswerOnlyOperation(operation) ? 'ANSWER' : 'FETCH_CONTEXT';
  }
  if (isCreAnswerOnlyOperation(operation)) return 'ANSWER';
  return 'PROCEED_TO_GATE';
}

/**
 * 评估合同字段缺口并生成 ContextRequirementPlan。
 */
export function evaluateContextRequirementPlan(
  resolved: CreOperationResolveResult,
  hints: CreContextHints,
): ContextRequirementPlan {
  const contract = getCreContextContract(resolved.operation);
  const expanded = expandCreContractFields(contract, {
    travelMode: hints.travelMode,
    containsOutdoorActivity: hints.containsOutdoorActivity,
    containsReservableActivity: hints.containsReservableActivity,
  });

  const requirements: CreResolvedRequirement[] = [];
  for (const field of expanded) {
    if (!evalWhenTrue(field.when, hints)) continue;
    const rawStatus = statusForKey(field.key, hints);
    const { status, blocking } = toBlockingStatus(
      rawStatus,
      field.blocking,
      field.necessity,
    );
    // OPTIONAL 合同字段永不阻断
    const finalBlocking = field.necessity === 'OPTIONAL' ? false : blocking;
    requirements.push({
      key: field.key,
      necessity: field.necessity,
      source: field.source,
      status: field.necessity === 'OPTIONAL' && finalBlocking === false
        ? status === 'BLOCKING' || status === 'USER_REQUIRED'
          ? 'OPTIONAL'
          : status
        : status,
      blocking: finalBlocking,
      freshness: field.freshness,
      labelZh: field.labelZh,
    });
  }

  const blockingGaps = requirements.filter((r) => r.blocking);
  const userQuestions = blockingGaps
    .filter((g) => g.status === 'USER_REQUIRED' || g.status === 'BLOCKING')
    .map(questionForGap);

  const acquisition = buildAcquisitionFlags(resolved.operation, requirements);
  const nextAction = resolveNextAction(resolved.operation, blockingGaps, requirements);

  return {
    operation: resolved.operation,
    confidence: resolved.confidence,
    executionLevel: contract.executionLevel,
    target: resolved.target,
    requirements,
    blockingGaps,
    userQuestions,
    nextAction,
    acquisition,
    reason: resolved.reason,
  };
}
