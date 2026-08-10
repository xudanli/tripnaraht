/**
 * Context Requirement Engine — Operation Resolver（规则优先，P0 无 LLM）。
 */

import type { RouteRunActionKind, TaskType } from '../utils/orchestration-signals.util';
import {
  isDayPaceAssessmentQuery,
  isTripStatusOverviewQuery,
  isWeatherImpactOnItineraryQuery,
} from '../utils/orchestration-signals.util';
import { isDiningRecommendationQuery } from '../utils/trip-dining-consultation.util';
import type { CreOperationResolveResult } from './context-requirement.types';
import type { CreOperation } from './operation.types';
import { parseTripDayNumber } from '../utils/itinerary-item-add.util';
import { stripPlanningModeWrapper } from '../utils/strip-planning-mode-wrapper.util';

export type ResolveCreOperationInput = {
  message: string;
  tripId?: string | null;
  routingTaskType?: TaskType;
  actionKind?: RouteRunActionKind;
  focusDayIndex?: number | null;
  /** P2：统一意图只读接管时传入，禁止 CONSULT/ASSESS 落到 OPTIMIZE */
  unifiedSemanticIntent?: import('../intent/unified-intent.types').SemanticIntent | null;
};

function extractDayIndex(message: string): number | undefined {
  const fromNl = parseTripDayNumber(message);
  if (fromNl != null && fromNl > 0) return fromNl;
  const m =
    message.match(/\bDay\s*(\d+)\b/i) ||
    message.match(/\[日程\]\s*Day\s*(\d+)/i) ||
    /** day1 / Day1 无空格 */
    message.match(/\bday(\d+)\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function stripScheduleAnchor(message: string): string {
  return stripPlanningModeWrapper(message).replace(/\n*\[日程\][\s\S]*$/u, '').trim();
}

/**
 * 从路由信号 + 话术映射到 CRE 操作。
 */
export function resolveCreOperation(input: ResolveCreOperationInput): CreOperationResolveResult {
  const raw = input.message ?? '';
  const msg = stripScheduleAnchor(raw);
  const dayIndex = input.focusDayIndex ?? extractDayIndex(raw);
  const actionKind = input.actionKind;
  const taskType = input.routingTaskType;

  const target: CreOperationResolveResult['target'] = {
    ...(dayIndex != null ? { dayIndex } : {}),
  };

  /**
   * P2：统一意图只读接管 — CONSULT/ASSESS 优先于 FULL_TRIP→OPTIMIZE 惯性。
   * P3：LOCAL_EDIT → 局部 CRE 操作，禁止 OPTIMIZE_TRIP。
   */
  if (input.unifiedSemanticIntent === 'CONSULT') {
    return {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 0.92,
      target,
      reason: 'unified_intent_consult',
    };
  }
  if (input.unifiedSemanticIntent === 'ASSESS_IMPACT') {
    return {
      operation: 'CHECK_EXECUTABILITY',
      confidence: 0.92,
      target,
      reason: 'unified_intent_assess_impact',
    };
  }
  if (input.unifiedSemanticIntent === 'LOCAL_EDIT') {
    const {
      mapLocalEditMessageToCreOperation,
    } = require('../intent/unified-intent.execution-route') as typeof import('../intent/unified-intent.execution-route');
    const op = mapLocalEditMessageToCreOperation(msg);
    const exp =
      msg.match(/(冰川徒步|黑沙滩|蓝湖|黄金圈|瀑布|温泉|午餐|晚饭|晚餐|早餐|[A-Za-zÀ-ÿ][\wÀ-ÿ\s-]{2,40})/)?.[1]?.trim();
    return {
      operation: op,
      confidence: 0.92,
      target: {
        ...target,
        ...(op === 'ADD_ACTIVITY_TO_DAY' && exp
          ? { experienceHint: exp.slice(0, 64) }
          : {}),
      },
      reason: 'unified_intent_local_edit',
    };
  }
  if (input.unifiedSemanticIntent === 'GLOBAL_PLAN') {
    const riskReplan = /风暴|封路|重排|plan\s*b|因风险/i.test(msg);
    /** 包装层抬成 GLOBAL 后，单日「增加活动」仍走加活动，勿 OPTIMIZE_TRIP→DAY_PACE */
    if (
      !riskReplan &&
      (/加到|加入|加上|增加|安排到|排到|新增|add\s*to\s*day|schedule\s*on/i.test(msg) ||
        /增加.{0,12}活动|加(?:一个|些|入)?.{0,16}(?:活动|景点|体验)/i.test(msg)) &&
      (dayIndex != null || /第\s*(?:\d+|[一二三四五六七八九十]{1,2})\s*天|\bDay\s*\d+\b/i.test(msg))
    ) {
      const exp =
        msg.match(/(冰川徒步|黑沙滩|蓝湖|黄金圈|瀑布|温泉|[A-Za-zÀ-ÿ][\wÀ-ÿ\s-]{2,40})/)?.[1]?.trim();
      return {
        operation: 'ADD_ACTIVITY_TO_DAY',
        confidence: 0.9,
        target: {
          ...target,
          ...(exp ? { experienceHint: exp.slice(0, 64) } : {}),
        },
        reason: 'global_wrapper_day_add_activity',
      };
    }
    return {
      operation: riskReplan ? 'REPLAN_DUE_TO_RISK' : 'OPTIMIZE_TRIP',
      confidence: 0.9,
      target: { ...target, scope: 'TRIP' },
      reason: 'unified_intent_global_plan',
    };
  }

  if (/上传.*订单|关联.*预订|booking\s*upload|attach\s*booking/i.test(msg)) {
    return {
      operation: 'UPLOAD_BOOKING',
      confidence: 0.9,
      target,
      reason: 'booking_upload_phrase',
    };
  }

  if (/换酒店|换住宿|改住宿|change\s*hotel|change\s*accommodation/i.test(msg)) {
    return {
      operation: 'CHANGE_ACCOMMODATION',
      confidence: 0.88,
      target,
      reason: 'accommodation_change_phrase',
    };
  }

  /**
   * P5 legacy：未传 unifiedSemanticIntent 时的 keyword 兜底。
   * 主链已始终传入统一意图；下列分支仅服务单测 / 旁路调用。
   */
  if (isDayPaceAssessmentQuery(msg)) {
    return {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 0.9,
      target,
      reason: 'day_pace_assessment',
    };
  }

  if (/比较|哪个更好|二选一|compare\s*option/i.test(msg)) {
    return {
      operation: 'COMPARE_OPTIONS',
      confidence: 0.82,
      target,
      reason: 'compare_phrase',
    };
  }

  if (
    /安全吗|还能去吗|能不能去|是否可行|executab|road\s*closed|封路|风暴/i.test(msg) ||
    isWeatherImpactOnItineraryQuery(msg) ||
    actionKind === 'SAFETY_OR_TRADEOFF_REVIEW'
  ) {
    if (/重排|改路线|plan\s*b|备选|太累|轻松一点/i.test(msg)) {
      return {
        operation: 'REPLAN_DUE_TO_RISK',
        confidence: 0.86,
        target: { ...target, scope: 'REMAINING' },
        reason: 'risk_replan_phrase',
      };
    }
    return {
      operation: 'CHECK_EXECUTABILITY',
      confidence: 0.88,
      target,
      reason: isWeatherImpactOnItineraryQuery(msg)
        ? 'weather_impact_on_itinerary'
        : 'executability_or_safety_phrase',
    };
  }

  if (/太累|轻松一点|后面.*简单|optimize\s*remaining|pace.*lighter/i.test(msg)) {
    return {
      operation: 'OPTIMIZE_TRIP',
      confidence: 0.84,
      target: { ...target, scope: 'FROM_CURRENT_DAY' },
      reason: 'pace_optimize_remaining',
    };
  }

  if (
    /优化.*天|重新排.*天|optimize\s*day/i.test(msg) ||
    actionKind === 'EXISTING_TRIP_ROUTE_OPTIMIZATION'
  ) {
    return {
      operation: 'OPTIMIZE_DAY',
      confidence: 0.85,
      target,
      reason: 'optimize_day_or_route_action',
    };
  }

  if (/替换|换成|replace/i.test(msg)) {
    return {
      operation: 'REPLACE_ACTIVITY',
      confidence: 0.87,
      target,
      reason: 'replace_phrase',
    };
  }

  if (/移动到|挪到|移到|move\s*to/i.test(msg)) {
    return {
      operation: 'MOVE_ACTIVITY',
      confidence: 0.87,
      target,
      reason: 'move_phrase',
    };
  }

  if (
    /加到|加入|安排到|排到|加上|增加|新增|add\s*to\s*day|schedule\s*on/i.test(msg) ||
    /增加.{0,12}活动|加(?:一个|些|入)?.{0,16}(?:活动|景点|体验)/i.test(msg) ||
    (actionKind === 'LOCAL_ITINERARY_EDIT' && /加|排|插|增/i.test(msg))
  ) {
    const exp =
      msg.match(/(冰川徒步|黑沙滩|蓝湖|黄金圈|瀑布|温泉|[A-Za-zÀ-ÿ][\wÀ-ÿ\s-]{2,40})/)?.[1]?.trim();
    return {
      operation: 'ADD_ACTIVITY_TO_DAY',
      confidence: 0.86,
      target: {
        ...target,
        ...(exp ? { experienceHint: exp.slice(0, 64) } : {}),
      },
      reason: 'add_activity_phrase',
    };
  }

  if (
    actionKind === 'TRIP_SCOPED_CONSULTATION' ||
    taskType === 'DATA_LOOKUP' ||
    taskType === 'GENERIC_QA' ||
    taskType === 'RAG_QA' ||
    actionKind === 'GENERIC'
  ) {
    return {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 0.9,
      target,
      reason: 'consultation_or_qa_signals',
    };
  }

  /**
   * P5 legacy：餐饮 / 概览 keyword（主链已由 unified CONSULT 覆盖）。
   */
  if (isDiningRecommendationQuery(msg)) {
    return {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 0.88,
      target,
      reason: 'dining_recommendation_consultation',
    };
  }

  if (isTripStatusOverviewQuery(msg, msg.toLowerCase())) {
    return {
      operation: 'ASK_TRIP_QUESTION',
      confidence: 0.88,
      target,
      reason: 'trip_status_overview_consultation',
    };
  }

  if (actionKind === 'LOCAL_ITINERARY_EDIT') {
    return {
      operation: 'ADD_ACTIVITY_TO_DAY',
      confidence: 0.55,
      target,
      reason: 'local_edit_fallback',
    };
  }

  if (actionKind === 'FULL_TRIP_PLANNING' || taskType === 'TRIP_PLANNING') {
    return {
      operation: 'OPTIMIZE_TRIP',
      confidence: 0.5,
      target,
      reason: 'planning_fallback',
    };
  }

  return {
    operation: 'GENERIC_UNKNOWN',
    confidence: 0.4,
    target,
    reason: 'unmapped',
  };
}

export function isCreAnswerOnlyOperation(op: CreOperation): boolean {
  return op === 'ASK_TRIP_QUESTION' || op === 'GENERIC_UNKNOWN' || op === 'COMPARE_OPTIONS';
}
