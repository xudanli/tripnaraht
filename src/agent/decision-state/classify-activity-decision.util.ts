/**
 * Activity Decision Classifier — 解析到 Decision Class × Action，不止 ACTIVITY。
 */

import {
  isActivityAdvanceBookingConsultQuery,
  extractScheduleActivityReferent,
} from '../chat/build-activity-booking-chat-cards.util';
import type { ActivityDecisionClass } from './decision-state.types';

export type ActivityDecisionClassification = {
  decisionClass: ActivityDecisionClass | null;
  confidence: number;
  reason: string;
};

function stripSchedule(message: string): string {
  return String(message ?? '')
    .replace(/\n*\[日程\][\s\S]*$/u, '')
    .trim();
}

/** 是否落在 Activity 决策族（否则 Shadow 跳过） */
export function isActivityDecisionFamily(message: string): boolean {
  const m = String(message ?? '');
  if (isActivityAdvanceBookingConsultQuery(m)) return true;
  if (/(?:冰川|冰洞|蓝湖|徒步|活动|景点).{0,12}?(?:适合|怎么样|安排)|(?:适合|怎么样|安排).{0,12}?(?:冰川|徒步|活动)/i.test(m)) {
    return true;
  }
  if (/(?:还有|有没有).{0,8}?(?:位置|名额|票)|sold\s*out|可订性/i.test(m)) {
    return true;
  }
  if (/需要.{0,8}?提前(?:订|预订|预定)|提前(?:多久|几天).{0,8}?(?:订|预订)/i.test(m)) {
    return true;
  }
  // RESERVE 临界：确认下单/支付 + 活动目标（不依赖「预订」词）
  if (
    /(?:确认下单|正式下单|去支付|授权支付|帮我下单)/i.test(m) &&
    /(?:冰川|冰洞|蓝湖|徒步|活动|景点|冰河湖)/i.test(m)
  ) {
    return true;
  }
  return false;
}

export function classifyActivityDecision(message: string): ActivityDecisionClassification {
  const full = String(message ?? '').trim();
  if (!full || !isActivityDecisionFamily(full)) {
    return { decisionClass: null, confidence: 0, reason: 'not_activity_decision_family' };
  }
  const utterance = stripSchedule(full);

  if (
    /确认下单|去支付|付款|授权支付|正式下单|帮我下单/i.test(utterance)
  ) {
    return {
      decisionClass: 'ACTIVITY.RESERVE',
      confidence: 0.85,
      reason: 'explicit_reserve_commit',
    };
  }

  if (
    /(?:还有|有没有|还有没有).{0,10}?(?:位置|名额|余位|票)|实时(?:库存|可订)|sold\s*out/i.test(
      utterance,
    )
  ) {
    return {
      decisionClass: 'ACTIVITY.AVAILABILITY_CHECK',
      confidence: 0.9,
      reason: 'availability_lex',
    };
  }

  if (
    /需要.{0,10}?提前(?:订|预订|预定|预约)|提前(?:多久|几天).{0,12}?(?:订|预订|预定)|要不要提前订|必须预订吗/i.test(
      utterance,
    )
  ) {
    return {
      decisionClass: 'ACTIVITY.BOOKING_GUIDANCE',
      confidence: 0.9,
      reason: 'booking_policy_lex',
    };
  }

  if (
    /(?:适合|适不适合|怎么样|能否安排|能不能安排|安排得下)/i.test(utterance) &&
    !/(?:预订|预定|预约|订票|买票)/i.test(utterance)
  ) {
    return {
      decisionClass: 'ACTIVITY.SUITABILITY_DECISION',
      confidence: 0.82,
      reason: 'suitability_lex',
    };
  }

  if (/(?:预订|预定|预约|订票|买票|帮我订|去订|想订)/i.test(utterance)) {
    return {
      decisionClass: 'ACTIVITY.RESERVATION_PREP',
      confidence: 0.88,
      reason: 'reservation_prep_lex',
    };
  }

  // 日程锚点 + 活动名：偏适配咨询
  if (extractScheduleActivityReferent(full) || /Day\s*\d+/i.test(full)) {
    return {
      decisionClass: 'ACTIVITY.SUITABILITY_DECISION',
      confidence: 0.55,
      reason: 'day_activity_fallback_suitability',
    };
  }

  return {
    decisionClass: 'ACTIVITY.BOOKING_GUIDANCE',
    confidence: 0.5,
    reason: 'activity_family_default_guidance',
  };
}
