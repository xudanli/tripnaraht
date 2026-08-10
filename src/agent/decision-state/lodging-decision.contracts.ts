/**
 * Lodging Decision Contracts — 第二域最小充分状态。
 * 证明 MDS 不是冰川徒步特判。
 */

import type { DecisionStateContract } from './decision-state.types';

const LODGING_IGNORED = [
  'day_pace',
  'fatigue',
  'weather',
  'road_status',
  'vehicle_fit',
  'activity_ref',
  'team_fitness_floor',
  'budget',
] as const;

/** 哪一天没住宿？ */
export const LODGING_GAP_QUERY_V1: DecisionStateContract = {
  decisionClass: 'LODGING.GAP_QUERY',
  version: 'lodging-gap-query@v1',
  labelZh: '行程住宿缺口查询',
  ignoredWorldKeys: [...LODGING_IGNORED],
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
      key: 'trip_day_span',
      necessity: 'REQUIRED',
      source: 'TRIP_DAY_LIST',
      acquisition: 'LOAD_TRIP_LODGING_SLICE',
      missingPolicy: 'ASK_USER',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '行程日跨度',
    },
    {
      key: 'lodging_coverage',
      necessity: 'REQUIRED',
      source: 'TRIP_LODGING_COVERAGE_SLICE',
      acquisition: 'LOAD_TRIP_LODGING_SLICE',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '住宿覆盖扫描',
    },
  ],
};

/** 第N天住哪 / 今晚住哪 */
export const LODGING_NIGHT_CHOICE_V1: DecisionStateContract = {
  decisionClass: 'LODGING.NIGHT_CHOICE',
  version: 'lodging-night-choice@v1',
  labelZh: '单日住宿安排查询',
  ignoredWorldKeys: [...LODGING_IGNORED, 'live_availability'],
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
      key: 'lodging_assignment',
      necessity: 'REQUIRED',
      source: 'TRIP_DAY_ITINERARY',
      acquisition: 'LOAD_TRIP_LODGING_SLICE',
      missingPolicy: 'DEGRADE',
      priority: 'P3_EXTERNAL',
      labelZh: '当日住宿指派',
    },
  ],
};

/** 找/订酒店（库存） */
export const LODGING_INVENTORY_SEARCH_V1: DecisionStateContract = {
  decisionClass: 'LODGING.INVENTORY_SEARCH',
  version: 'lodging-inventory-search@v1',
  labelZh: '住宿库存检索',
  ignoredWorldKeys: [...LODGING_IGNORED, 'day_conflict', 'team_fitness_floor'],
  keys: [
    {
      key: 'day_anchor',
      necessity: 'CONDITIONAL',
      source: 'PAGE_FOCUS | USER_INPUT',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P0_SEMANTIC_ANCHOR',
      labelZh: '入住/日锚点',
    },
    {
      key: 'party_size',
      necessity: 'OPTIONAL',
      source: 'TRIP_STATE',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '人数',
    },
    {
      key: 'booking_channel',
      necessity: 'REQUIRED',
      source: 'HOTEL_PROVIDER',
      acquisition: 'LIVE_THEN_CATALOG',
      missingPolicy: 'CATALOG_FALLBACK',
      priority: 'P3_EXTERNAL',
      labelZh: '住宿检索通道',
    },
  ],
};

const REGISTRY: Record<string, DecisionStateContract> = {
  'LODGING.GAP_QUERY': LODGING_GAP_QUERY_V1,
  'LODGING.NIGHT_CHOICE': LODGING_NIGHT_CHOICE_V1,
  'LODGING.INVENTORY_SEARCH': LODGING_INVENTORY_SEARCH_V1,
};

export function getLodgingDecisionContract(
  decisionClass: string,
): DecisionStateContract | null {
  return REGISTRY[decisionClass] ?? null;
}

export function listLodgingDecisionContracts(): DecisionStateContract[] {
  return Object.values(REGISTRY);
}
