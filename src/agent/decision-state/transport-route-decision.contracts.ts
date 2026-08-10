/**
 * Transport / Route Decision Contracts — 第三域。
 */

import type { DecisionStateContract } from './decision-state.types';

const TRANSPORT_IGNORED = [
  'day_pace',
  'fatigue',
  'lodging_coverage',
  'activity_ref',
  'team_fitness_floor',
  'budget',
  'diningPreferences',
] as const;

/** 租车/保险/F-road 政策咨询 */
export const TRANSPORT_RENTAL_GUIDANCE_V1: DecisionStateContract = {
  decisionClass: 'TRANSPORT.RENTAL_GUIDANCE',
  version: 'transport-rental-guidance@v1',
  labelZh: '租车与道路政策指导',
  ignoredWorldKeys: [...TRANSPORT_IGNORED, 'day_conflict', 'live_availability'],
  keys: [
    {
      key: 'rental_policy',
      necessity: 'REQUIRED',
      source: 'ICELAND_RENTAL_GUIDANCE | CATALOG',
      acquisition: 'CATALOG_ONLY',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '租车/保险/F 路政策',
    },
    {
      key: 'road_access',
      necessity: 'CONDITIONAL',
      when: 'mentions_froad_or_highland',
      source: 'USER_INPUT | ROAD_SERVICE',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P3_EXTERNAL',
      labelZh: '道路可达语境',
    },
    {
      key: 'vehicle_profile',
      necessity: 'OPTIONAL',
      source: 'TRIP_VEHICLE | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '车型档案',
    },
  ],
};

/** 2WD / 四驱能否上高地或 F 路 */
export const TRANSPORT_VEHICLE_FIT_V1: DecisionStateContract = {
  decisionClass: 'TRANSPORT.VEHICLE_FIT',
  version: 'transport-vehicle-fit@v1',
  labelZh: '车型与道路适配',
  ignoredWorldKeys: [...TRANSPORT_IGNORED, 'lodging_assignment', 'booking_channel'],
  keys: [
    {
      key: 'vehicle_profile',
      necessity: 'REQUIRED',
      source: 'TRIP_VEHICLE | USER_INPUT',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '车型（2WD/四驱等）',
    },
    {
      key: 'road_access',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | ROAD_SERVICE',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '目标道路/高地语境',
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

/** 优化第 N 天路线顺序 */
export const ROUTE_DAY_ORDER_OPTIMIZE_V1: DecisionStateContract = {
  decisionClass: 'ROUTE.DAY_ORDER_OPTIMIZE',
  version: 'route-day-order-optimize@v1',
  labelZh: '单日路线顺序优化',
  ignoredWorldKeys: [
    ...TRANSPORT_IGNORED,
    'rental_policy',
    'team_fitness_floor',
    'live_availability',
    'lodging_coverage',
    'memberCapability',
    'team.memberCapability',
    'fatigue',
    'booking.fixedCommitments',
    'route.travelTimeMatrix',
    'pacePreference',
  ],
  keys: [
    {
      key: 'trip_binding',
      necessity: 'REQUIRED',
      source: 'REQUEST.trip_id',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '行程绑定',
    },
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
      key: 'route_scope',
      necessity: 'REQUIRED',
      source: 'USER_INPUT | TRIP_DAY',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '路线优化范围',
    },
  ],
};

const REGISTRY: Record<string, DecisionStateContract> = {
  'TRANSPORT.RENTAL_GUIDANCE': TRANSPORT_RENTAL_GUIDANCE_V1,
  'TRANSPORT.VEHICLE_FIT': TRANSPORT_VEHICLE_FIT_V1,
  'ROUTE.DAY_ORDER_OPTIMIZE': ROUTE_DAY_ORDER_OPTIMIZE_V1,
};

export function getTransportRouteDecisionContract(
  decisionClass: string,
): DecisionStateContract | null {
  return REGISTRY[decisionClass] ?? null;
}
