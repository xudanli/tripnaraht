/**
 * Dining / Risk Decision Contracts — 第四批域。
 */

import type { DecisionStateContract } from './decision-state.types';

const DINING_IGNORED = [
  'day_pace',
  'fatigue',
  'vehicle_fit',
  'team_fitness_floor',
  'live_availability',
  'road_status',
  'rental_policy',
] as const;

const RISK_IGNORED = [
  'lodging_coverage',
  'booking_channel',
  'restaurant_channel',
  'rental_policy',
  'payment_authorization',
] as const;

/** 吃什么 / 推荐餐厅（可无锚点→追问或泛化） */
export const DINING_RECOMMENDATION_V1: DecisionStateContract = {
  decisionClass: 'DINING.RECOMMENDATION',
  version: 'dining-recommendation@v1',
  labelZh: '餐饮推荐',
  ignoredWorldKeys: [...DINING_IGNORED, 'weather_evidence'],
  keys: [
    {
      key: 'dining_anchor',
      necessity: 'OPTIONAL',
      source: 'USER_INPUT | PAGE_FOCUS | TRIP_DAY',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '用餐锚点（日/区域；缺失则泛化推荐）',
    },
    {
      key: 'trip_binding',
      necessity: 'OPTIONAL',
      source: 'REQUEST.trip_id',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '行程绑定',
    },
    {
      key: 'restaurant_channel',
      necessity: 'OPTIONAL',
      source: 'RESTAURANT_MCP',
      acquisition: 'LIVE_THEN_CATALOG',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P3_EXTERNAL',
      labelZh: '餐厅检索通道',
    },
  ],
};

/** 某站/某日附近吃什么 */
export const DINING_NEAR_POI_V1: DecisionStateContract = {
  decisionClass: 'DINING.NEAR_POI',
  version: 'dining-near-poi@v1',
  labelZh: '站点附近餐饮',
  ignoredWorldKeys: [...DINING_IGNORED],
  keys: [
    {
      key: 'dining_anchor',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | TRIP_DAY',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '站点/日锚点',
    },
    {
      key: 'restaurant_channel',
      necessity: 'REQUIRED',
      source: 'RESTAURANT_MCP',
      acquisition: 'LIVE_THEN_CATALOG',
      missingPolicy: 'CATALOG_FALLBACK',
      priority: 'P3_EXTERNAL',
      labelZh: '餐厅检索通道',
    },
  ],
};

/** 天气会不会耽误行程 */
export const RISK_WEATHER_IMPACT_V1: DecisionStateContract = {
  decisionClass: 'RISK.WEATHER_IMPACT',
  version: 'risk-weather-impact@v1',
  labelZh: '天气对行程影响',
  ignoredWorldKeys: [...RISK_IGNORED, 'day_pace', 'team_fitness_floor'],
  keys: [
    {
      key: 'trip_binding',
      necessity: 'OPTIONAL',
      source: 'REQUEST.trip_id',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '行程绑定',
    },
    {
      key: 'day_anchor',
      necessity: 'OPTIONAL',
      source: 'PAGE_FOCUS | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '关注日',
    },
    {
      key: 'weather_evidence',
      necessity: 'REQUIRED',
      source: 'WEATHER_SERVICE',
      acquisition: 'PROVIDER_LIVE',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '天气证据',
    },
  ],
};

/**
 * 「会不会太赶」节奏诊断 — 取代 ROR DAY_PACE 硬追问。
 * 不要求 fitness/pacePreference；有日锚即可作答。
 */
export const RISK_PACE_ASSESS_V1: DecisionStateContract = {
  decisionClass: 'RISK.PACE_ASSESS',
  version: 'risk-pace-assess@v1',
  labelZh: '日程节奏诊断',
  ignoredWorldKeys: [
    ...RISK_IGNORED,
    'pacePreference',
    'fatigue',
    'memberCapability',
    'physicalIntensity',
    'booking.fixedCommitments',
  ],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'REQUIRED',
      source: 'PAGE_FOCUS | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '诊断日',
    },
    {
      key: 'day_activity_seed',
      necessity: 'OPTIONAL',
      source: 'TRIP_DAY_WORLD_STATE',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '当日活动种子',
    },
    {
      key: 'trip_binding',
      necessity: 'OPTIONAL',
      source: 'REQUEST.trip_id',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '行程绑定',
    },
  ],
};

const REGISTRY: Record<string, DecisionStateContract> = {
  'DINING.RECOMMENDATION': DINING_RECOMMENDATION_V1,
  'DINING.NEAR_POI': DINING_NEAR_POI_V1,
  'RISK.WEATHER_IMPACT': RISK_WEATHER_IMPACT_V1,
  'RISK.PACE_ASSESS': RISK_PACE_ASSESS_V1,
};

export function getDiningRiskDecisionContract(
  decisionClass: string,
): DecisionStateContract | null {
  return REGISTRY[decisionClass] ?? null;
}
