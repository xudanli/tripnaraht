/**
 * Plan Decision Contracts — 规划草案继续（承接原 GLOBAL_PLAN soft-suppress）。
 */

import type { DecisionStateContract } from './decision-state.types';

/** 重新规划某日/整段：不因体能/疲劳/固定订单缺口阻断出草案 */
export const PLAN_DAY_REPLAN_V1: DecisionStateContract = {
  decisionClass: 'PLAN.DAY_REPLAN',
  version: 'plan-day-replan@v1',
  labelZh: '行程重规划（草案继续）',
  ignoredWorldKeys: [
    'day_pace',
    'pacePreference',
    'fatigue',
    'memberCapability',
    'physicalIntensity',
    'team.memberCapability',
    'user.currentFatigue',
    'experience.physicalIntensity',
    'user.pacePreference',
    'booking.fixedCommitments',
    'route.travelTimeMatrix',
    'diningPreferences',
    'partySize',
    'live_availability',
    'restaurant_channel',
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
      necessity: 'OPTIONAL',
      source: 'USER_INPUT | PAGE_FOCUS',
      acquisition: 'DERIVE_FROM_TRIP_DAY',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '重规划焦点日',
    },
    {
      key: 'route_scope',
      necessity: 'OPTIONAL',
      source: 'USER_INPUT',
      acquisition: 'DERIVE_FROM_MESSAGE',
      missingPolicy: 'ALLOW_WITH_UNKNOWN',
      priority: 'P4_OPTIONAL',
      labelZh: '重规划范围',
    },
  ],
};

export function getPlanDecisionContract(decisionClass: string): DecisionStateContract | null {
  if (decisionClass === 'PLAN.DAY_REPLAN') return PLAN_DAY_REPLAN_V1;
  return null;
}
