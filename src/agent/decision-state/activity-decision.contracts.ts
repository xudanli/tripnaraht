/**
 * Activity Decision Contracts — Decision Class × Action Mode 最小充分状态声明。
 */

import type { DecisionStateContract } from './decision-state.types';

const ACTIVITY_IGNORED = [
  'day_pace',
  'fatigue',
  'hotel_status',
  'vehicle_fit',
  'budget',
  'weather',
  'road_status',
] as const;

/** A. 需要提前订吗？ */
export const ACTIVITY_BOOKING_GUIDANCE_V1: DecisionStateContract = {
  decisionClass: 'ACTIVITY.BOOKING_GUIDANCE',
  version: 'activity-booking-guidance@v1',
  labelZh: '活动是否需提前预订（政策/目录）',
  ignoredWorldKeys: [...ACTIVITY_IGNORED, 'day_anchor', 'team_fitness_floor', 'day_conflict'],
  keys: [
    {
      key: 'activity_ref',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | CATALOG',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '活动对象',
    },
    {
      key: 'booking_policy',
      necessity: 'REQUIRED',
      source: 'PRODUCT_CATALOG',
      acquisition: 'CATALOG_ONLY',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '预订政策/目录',
    },
  ],
};

/** B. 第N天还有位置吗？— live 为硬要求 */
export const ACTIVITY_AVAILABILITY_CHECK_V1: DecisionStateContract = {
  decisionClass: 'ACTIVITY.AVAILABILITY_CHECK',
  version: 'activity-availability-check@v1',
  labelZh: '活动实时可订性核查',
  ignoredWorldKeys: [...ACTIVITY_IGNORED, 'team_fitness_floor'],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'REQUIRED',
      source: 'PAGE_FOCUS | USER_INPUT | TRIP_DAY',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '日锚点',
    },
    {
      key: 'activity_ref',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | ITINERARY',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '活动对象',
    },
    {
      key: 'party_size',
      necessity: 'CONDITIONAL',
      source: 'TRIP_STATE | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P2_USER_REQUIRED',
      labelZh: '出行人数',
    },
    {
      key: 'booking_channel',
      necessity: 'REQUIRED',
      source: 'ACTIVITY_PROVIDER',
      acquisition: 'LIVE_THEN_CATALOG',
      missingPolicy: 'CATALOG_FALLBACK',
      priority: 'P3_EXTERNAL',
      labelZh: '预订通道（LIVE 权威）',
    },
    {
      key: 'live_availability',
      necessity: 'REQUIRED',
      source: 'ACTIVITY_PROVIDER_LIVE',
      acquisition: 'PROVIDER_LIVE',
      missingPolicy: 'BLOCK',
      priority: 'P3_EXTERNAL',
      labelZh: '实时余位证据',
    },
  ],
};

/** C. 第N天安排冰川徒步怎么样？ */
export const ACTIVITY_SUITABILITY_DECISION_V1: DecisionStateContract = {
  decisionClass: 'ACTIVITY.SUITABILITY_DECISION',
  version: 'activity-suitability@v1',
  labelZh: '活动日程适配性（体能/冲突）',
  ignoredWorldKeys: [...ACTIVITY_IGNORED, 'live_availability'],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'REQUIRED',
      source: 'PAGE_FOCUS | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '日锚点',
    },
    {
      key: 'activity_ref',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | ITINERARY',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '活动对象',
    },
    {
      key: 'team_fitness_floor',
      necessity: 'CONDITIONAL',
      when: 'activity.high_intensity',
      source: 'TRIP_MEMBERS / FITNESS',
      acquisition: 'AGGREGATE_MEMBERS',
      missingPolicy: 'NEED_CONFIRM',
      priority: 'P1_HARD_SAFETY',
      labelZh: '团队体能木桶',
    },
    {
      key: 'activity_requirements',
      necessity: 'OPTIONAL',
      source: 'CATALOG',
      acquisition: 'CATALOG_ONLY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '活动强度要求',
    },
    {
      key: 'day_conflict',
      necessity: 'REQUIRED',
      source: 'TRIP_DAY_WORLD_STATE',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'WARN',
      priority: 'P1_HARD_SAFETY',
      labelZh: '日程冲突',
    },
  ],
};

/**
 * D. 展示预订方案 / 跳转卡（非支付下单）
 * 对应用户认可的五维 MDS。
 */
export const ACTIVITY_RESERVATION_PREP_V1: DecisionStateContract = {
  decisionClass: 'ACTIVITY.RESERVATION_PREP',
  version: 'activity-reservation-prep@v1',
  labelZh: '活动预订准备（出卡/目录回落）',
  ignoredWorldKeys: [...ACTIVITY_IGNORED],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'REQUIRED',
      source: 'PAGE_FOCUS | USER_INPUT | TRIP_DAY',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '日锚点',
    },
    {
      key: 'activity_ref',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | ITINERARY | CATALOG',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '活动对象',
    },
    {
      key: 'team_fitness_floor',
      necessity: 'CONDITIONAL',
      when: 'activity.high_intensity',
      source: 'TRIP_MEMBERS / FITNESS',
      acquisition: 'AGGREGATE_MEMBERS',
      missingPolicy: 'NEED_CONFIRM',
      priority: 'P1_HARD_SAFETY',
      labelZh: '团队体能木桶',
    },
    {
      key: 'booking_channel',
      necessity: 'REQUIRED',
      source: 'ACTIVITY_PROVIDER',
      acquisition: 'LIVE_THEN_CATALOG',
      missingPolicy: 'CATALOG_FALLBACK',
      priority: 'P3_EXTERNAL',
      labelZh: '预订通道',
    },
    {
      key: 'day_conflict',
      necessity: 'REQUIRED',
      source: 'TRIP_DAY_WORLD_STATE',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'WARN',
      priority: 'P1_HARD_SAFETY',
      labelZh: '日程冲突',
    },
  ],
};

/** E. 真正代订 / 支付确认 — Phase1 仅声明，通常 BLOCKED */
export const ACTIVITY_RESERVE_V1: DecisionStateContract = {
  decisionClass: 'ACTIVITY.RESERVE',
  version: 'activity-reserve@v1',
  labelZh: '活动确认下单（硬执行）',
  ignoredWorldKeys: [...ACTIVITY_IGNORED],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'REQUIRED',
      source: 'USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '日锚点',
    },
    {
      key: 'activity_ref',
      necessity: 'REQUIRED',
      source: 'USER_INPUT',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '活动对象',
    },
    {
      key: 'party_size',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P2_USER_REQUIRED',
      labelZh: '出行人数',
    },
    {
      key: 'selected_slot',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | LIVE',
      acquisition: 'USER_PROMPT',
      missingPolicy: 'ASK_USER',
      priority: 'P2_USER_REQUIRED',
      labelZh: '选定场次',
    },
    {
      key: 'live_availability',
      necessity: 'REQUIRED',
      source: 'PROVIDER_LIVE',
      acquisition: 'PROVIDER_LIVE',
      missingPolicy: 'BLOCK',
      priority: 'P3_EXTERNAL',
      labelZh: '实时可订证据',
    },
    {
      key: 'member_eligibility',
      necessity: 'REQUIRED',
      source: 'TEAM_FITNESS',
      acquisition: 'AGGREGATE_MEMBERS',
      missingPolicy: 'NEED_CONFIRM',
      priority: 'P1_HARD_SAFETY',
      labelZh: '成员资格/体能',
    },
    {
      key: 'contact_info',
      necessity: 'REQUIRED',
      source: 'USER_PROFILE',
      acquisition: 'USER_PROMPT',
      missingPolicy: 'ASK_USER',
      priority: 'P2_USER_REQUIRED',
      labelZh: '联系人',
    },
    {
      key: 'payment_authorization',
      necessity: 'REQUIRED',
      source: 'USER_CONFIRM',
      acquisition: 'USER_PROMPT',
      missingPolicy: 'BLOCK',
      priority: 'P2_USER_REQUIRED',
      labelZh: '支付/授权确认',
    },
  ],
};

const REGISTRY: Record<string, DecisionStateContract> = {
  'ACTIVITY.BOOKING_GUIDANCE': ACTIVITY_BOOKING_GUIDANCE_V1,
  'ACTIVITY.AVAILABILITY_CHECK': ACTIVITY_AVAILABILITY_CHECK_V1,
  'ACTIVITY.SUITABILITY_DECISION': ACTIVITY_SUITABILITY_DECISION_V1,
  'ACTIVITY.RESERVATION_PREP': ACTIVITY_RESERVATION_PREP_V1,
  'ACTIVITY.RESERVE': ACTIVITY_RESERVE_V1,
};

export function getActivityDecisionContract(
  decisionClass: string,
): DecisionStateContract | null {
  return REGISTRY[decisionClass] ?? null;
}

export function listActivityDecisionContracts(): DecisionStateContract[] {
  return Object.values(REGISTRY);
}
