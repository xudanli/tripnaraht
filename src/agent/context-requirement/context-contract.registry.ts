/**
 * Context Requirement Engine — 声明式上下文合同表（P0）。
 * 研发可读：为什么需要、何时需要、从哪取、是否阻断。
 */

import type { CreContextContract } from './context-requirement.types';
import type { CreOperation } from './operation.types';

const ASK_TRIP_QUESTION: CreContextContract = {
  operation: 'ASK_TRIP_QUESTION',
  executionLevel: 'ANSWER_CONTEXT',
  labelZh: '行程内轻量问答',
  fields: [
    {
      key: 'trip.destination',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      blocking: false,
      labelZh: '目的地/城市',
    },
    {
      key: 'page.focusDay',
      necessity: 'OPTIONAL',
      source: 'PAGE_FOCUS',
      blocking: false,
      labelZh: '当前焦点日',
    },
    {
      key: 'user.diningPreferences',
      necessity: 'OPTIONAL',
      source: 'USER_PROFILE',
      blocking: false,
      labelZh: '餐饮偏好',
    },
    {
      key: 'trip.partySize',
      necessity: 'OPTIONAL',
      source: 'TRIP_STATE',
      blocking: false,
      labelZh: '人数',
    },
  ],
};

const ADD_ACTIVITY_TO_DAY: CreContextContract = {
  operation: 'ADD_ACTIVITY_TO_DAY',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '向某天加入体验/活动',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true, labelZh: '行程 ID' },
    {
      key: 'targetDay.date',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      blocking: true,
      labelZh: '目标日日期',
    },
    {
      key: 'targetDay.activities',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      blocking: true,
      labelZh: '当日已有安排',
    },
    {
      key: 'targetDay.accommodation',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      blocking: false,
      labelZh: '当日住宿',
    },
    {
      key: 'experience.product',
      necessity: 'REQUIRED',
      source: 'PRODUCT_CATALOG',
      blocking: true,
      labelZh: '体验产品',
    },
    {
      key: 'participants',
      necessity: 'REQUIRED',
      source: 'TEAM_PROFILE',
      blocking: true,
      labelZh: '成员档案',
    },
    {
      key: 'participants.fitnessProfile',
      necessity: 'CONDITIONAL',
      source: 'TEAM_PROFILE',
      when: 'containsOutdoorActivity === true',
      blocking: true,
      labelZh: '体能档案',
    },
    {
      key: 'travelMode',
      necessity: 'REQUIRED',
      source: 'TRIP_STATE',
      blocking: false,
      labelZh: '出行方式',
    },
    {
      key: 'vehicle.profile',
      necessity: 'CONDITIONAL',
      source: 'TRIP_STATE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: true,
      labelZh: '车辆档案',
    },
    {
      key: 'roadConditions',
      necessity: 'CONDITIONAL',
      source: 'ROAD_SERVICE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: false,
      freshness: '6h',
      labelZh: '道路状态',
    },
    {
      key: 'weather.forecast',
      necessity: 'CONDITIONAL',
      source: 'WEATHER_SERVICE',
      when: 'containsOutdoorActivity === true',
      blocking: false,
      freshness: '6h',
      labelZh: '天气预报',
    },
    {
      key: 'booking.availability',
      necessity: 'CONDITIONAL',
      source: 'PRODUCT_CATALOG',
      when: 'containsReservableActivity === true',
      blocking: false,
      labelZh: '可订状态',
    },
  ],
};

const MOVE_ACTIVITY: CreContextContract = {
  operation: 'MOVE_ACTIVITY',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '移动活动',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'activity.ref', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true, labelZh: '活动对象' },
    { key: 'sourceDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.activities', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    {
      key: 'routeTravelTimes',
      necessity: 'CONDITIONAL',
      source: 'DERIVED',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: false,
    },
  ],
};

const REPLACE_ACTIVITY: CreContextContract = {
  operation: 'REPLACE_ACTIVITY',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '替换活动',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'activity.ref', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true },
    { key: 'targetDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'experience.product', necessity: 'REQUIRED', source: 'PRODUCT_CATALOG', blocking: true },
    { key: 'participants', necessity: 'REQUIRED', source: 'TEAM_PROFILE', blocking: false },
  ],
};

const OPTIMIZE_DAY: CreContextContract = {
  operation: 'OPTIMIZE_DAY',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '优化某一天',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.activities', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.accommodation', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: false },
    { key: 'participants', necessity: 'REQUIRED', source: 'TEAM_PROFILE', blocking: true },
    { key: 'travelMode', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: false },
    {
      key: 'vehicle.profile',
      necessity: 'CONDITIONAL',
      source: 'TRIP_STATE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: true,
    },
    {
      key: 'roadConditions',
      necessity: 'CONDITIONAL',
      source: 'ROAD_SERVICE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: false,
      freshness: '6h',
    },
    {
      key: 'routeTravelTimes',
      necessity: 'CONDITIONAL',
      source: 'DERIVED',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: false,
    },
    {
      key: 'weather.forecast',
      necessity: 'CONDITIONAL',
      source: 'WEATHER_SERVICE',
      when: 'containsOutdoorActivity === true',
      blocking: false,
      freshness: '6h',
    },
  ],
};

const OPTIMIZE_TRIP: CreContextContract = {
  operation: 'OPTIMIZE_TRIP',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '优化剩余行程',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'trip.remainingDays', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'participants', necessity: 'REQUIRED', source: 'TEAM_PROFILE', blocking: true },
    { key: 'user.pacePreference', necessity: 'OPTIONAL', source: 'USER_INPUT', blocking: false },
  ],
};

const CHECK_EXECUTABILITY: CreContextContract = {
  operation: 'CHECK_EXECUTABILITY',
  executionLevel: 'RECOMMENDATION_CONTEXT',
  labelZh: '检查能否按计划执行',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.activities', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'weather.forecast', necessity: 'REQUIRED', source: 'WEATHER_SERVICE', blocking: false, freshness: '6h' },
    {
      key: 'roadConditions',
      necessity: 'CONDITIONAL',
      source: 'ROAD_SERVICE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: true,
      freshness: '3h',
    },
    {
      key: 'vehicle.profile',
      necessity: 'CONDITIONAL',
      source: 'TRIP_STATE',
      when: "travelMode === 'SELF_DRIVE'",
      blocking: true,
    },
  ],
};

const COMPARE_OPTIONS: CreContextContract = {
  operation: 'COMPARE_OPTIONS',
  executionLevel: 'RECOMMENDATION_CONTEXT',
  labelZh: '比较方案',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: false },
    { key: 'options.candidates', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true },
    { key: 'participants', necessity: 'OPTIONAL', source: 'TEAM_PROFILE', blocking: false },
  ],
};

const CHANGE_ACCOMMODATION: CreContextContract = {
  operation: 'CHANGE_ACCOMMODATION',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '修改住宿',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'targetDay.date', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'accommodation.candidate', necessity: 'REQUIRED', source: 'PRODUCT_CATALOG', blocking: true },
    { key: 'routeTravelTimes', necessity: 'OPTIONAL', source: 'DERIVED', blocking: false },
  ],
};

const REPLAN_DUE_TO_RISK: CreContextContract = {
  operation: 'REPLAN_DUE_TO_RISK',
  executionLevel: 'DRAFT_CONTEXT',
  labelZh: '风险触发重排',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'risk.trigger', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true },
    { key: 'targetDay.activities', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'weather.forecast', necessity: 'REQUIRED', source: 'WEATHER_SERVICE', blocking: false, freshness: '3h' },
    { key: 'roadConditions', necessity: 'REQUIRED', source: 'ROAD_SERVICE', blocking: false, freshness: '3h' },
    { key: 'participants', necessity: 'REQUIRED', source: 'TEAM_PROFILE', blocking: false },
  ],
};

const UPLOAD_BOOKING: CreContextContract = {
  operation: 'UPLOAD_BOOKING',
  executionLevel: 'APPLY_CONTEXT',
  labelZh: '上传/关联订单',
  fields: [
    { key: 'trip.id', necessity: 'REQUIRED', source: 'TRIP_STATE', blocking: true },
    { key: 'booking.artifact', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true },
    { key: 'booking.targetRef', necessity: 'OPTIONAL', source: 'TRIP_STATE', blocking: false },
  ],
};

const GENERIC_UNKNOWN: CreContextContract = {
  operation: 'GENERIC_UNKNOWN',
  executionLevel: 'ANSWER_CONTEXT',
  labelZh: '未识别操作（保守问答）',
  fields: [
    { key: 'trip.destination', necessity: 'OPTIONAL', source: 'TRIP_STATE', blocking: false },
    { key: 'user.message', necessity: 'REQUIRED', source: 'USER_INPUT', blocking: true },
  ],
};

export const CRE_CONTEXT_CONTRACTS: Record<CreOperation, CreContextContract> = {
  ASK_TRIP_QUESTION,
  ADD_ACTIVITY_TO_DAY,
  MOVE_ACTIVITY,
  REPLACE_ACTIVITY,
  OPTIMIZE_DAY,
  OPTIMIZE_TRIP,
  CHECK_EXECUTABILITY,
  COMPARE_OPTIONS,
  CHANGE_ACCOMMODATION,
  REPLAN_DUE_TO_RISK,
  UPLOAD_BOOKING,
  GENERIC_UNKNOWN,
};

export function getCreContextContract(operation: CreOperation): CreContextContract {
  return CRE_CONTEXT_CONTRACTS[operation] ?? CRE_CONTEXT_CONTRACTS.GENERIC_UNKNOWN;
}

/** 展开条件字段：不满足 when 的 CONDITIONAL 字段剔除 */
export function expandCreContractFields(
  contract: CreContextContract,
  flags: {
    travelMode?: 'SELF_DRIVE' | 'OTHER' | null;
    containsOutdoorActivity?: boolean;
    containsReservableActivity?: boolean;
  },
): CreContextContract['fields'] {
  return contract.fields.filter((f) => {
    if (!f.when) return true;
    if (f.when === "travelMode === 'SELF_DRIVE'") {
      return flags.travelMode === 'SELF_DRIVE';
    }
    if (f.when === 'containsOutdoorActivity === true') {
      return flags.containsOutdoorActivity === true;
    }
    if (f.when === 'containsReservableActivity === true') {
      return flags.containsReservableActivity === true;
    }
    return true;
  });
}
