import { TEMPORAL_IMPACT_SCHEMA } from '../types/temporal-impact.types';
import { DECISION_OUTCOME_SCHEMA } from '../types/decision-outcome.types';
import {
  TRAVEL_CAUSAL_DECISION_SCHEMA,
  type TravelCausalDecision,
} from '../types/travel-causal-decision.types';
import {
  composeRuleVersionStamp,
  listTravelCausalRules,
} from '../registry/travel-causal-rule.registry';
import { STANDARD_CAUSAL_CASE_IDS } from './case-ids';

/**
 * Case 2 — 封路 → 绕行 → 驾驶超限 → 晚到住宿 → 次日受影响
 */
export function buildRoadClosureOvernightFixture(): TravelCausalDecision {
  const rules = listTravelCausalRules({
    caseTag: STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT,
    reviewStatus: 'APPROVED',
  });
  const ruleVersion = composeRuleVersionStamp(rules);

  return {
    schema: TRAVEL_CAUSAL_DECISION_SCHEMA,
    decisionId: 'dec_road_closure_overnight_demo',
    tripId: 'trip_is_highlands_demo',
    observationSummary: 'F208 北段因融雪封闭，原跨日计划不可执行。',
    rootCause: {
      id: 'node:road:f208_closed',
      type: 'ROAD',
      label: '道路封闭',
      state: { roadId: 'F208', status: 'CLOSED' },
    },
    causalChain: [
      {
        effectId: 'e1',
        fromNodeId: 'node:road:f208_closed',
        toNodeId: 'node:route:detour',
        relation: 'CAUSES',
        summary: '封路 → 必须绕行',
        ruleId: 'is.road.closed_forces_detour',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e2',
        fromNodeId: 'node:route:detour',
        toNodeId: 'node:human:drive_load',
        relation: 'AMPLIFIES',
        summary: '绕行 → 当日驾驶超限约 +95 分钟',
        predictedValue: { extraDriveMinutes: 95 },
        ruleId: 'is.detour.overnight_cascade',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e3',
        fromNodeId: 'node:human:drive_load',
        toNodeId: 'node:activity:hotel',
        relation: 'CAUSES',
        summary: '驾驶超限 → 晚到住宿',
        predictedValue: { lateArrivalMinutes: 70 },
        ruleId: 'is.detour.overnight_cascade',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e4',
        fromNodeId: 'node:activity:hotel',
        toNodeId: 'node:temporal:next_day',
        relation: 'AMPLIFIES',
        summary: '晚到住宿 → 次日出发与体力窗口受影响',
        ruleId: 'is.detour.overnight_cascade',
        ruleVersion: '1.0.0',
      },
    ],
    evidenceRefs: ['fact:road.f208.status', 'fact:day.drive_budget', 'fact:hotel.checkin'],
    temporalForecast: {
      schema: TEMPORAL_IMPACT_SCHEMA,
      detectedAt: '2026-07-17T07:15:00.000Z',
      expectedOnsetAt: '2026-07-17T08:00:00.000Z',
      deteriorationAt: '2026-07-17T16:30:00.000Z',
      interventionDeadline: '2026-07-17T10:00:00.000Z',
      confidence: 0.9,
      assumptions: ['绕行走 Ring Road 东线', '住宿不可改到更西的营地', '次日仍有冰川徒步'],
    },
    baselineOutcome: {
      completionProbability: 0.34,
      riskLevel: 'HIGH',
      costImpact: 220,
      metrics: { next_day_disruption_prob: 0.78, extra_drive_minutes: 95 },
    },
    doNothingSummary: '什么都不做：当晚晚到概率高，次日行程完成率降至约 34%。',
    interventions: [
      {
        optionId: 'opt_restructure_overnight',
        title: '改住东线并压缩次日上午',
        recommended: true,
        changes: [
          {
            changeType: 'CHANGE_OVERNIGHT',
            targetEntityType: 'DAY',
            targetEntityId: 'day_3',
            description: '住宿改至东线可抵达酒店，次日活动后移',
          },
        ],
        expectedOutcome: {
          completionProbability: 0.88,
          riskLevel: 'MEDIUM',
          costImpact: 40,
        },
        tradeoffs: [
          { dimension: 'COST', direction: 'WORSE', summary: '可能产生改订费用', magnitude: 40 },
          { dimension: 'RISK', direction: 'BETTER', summary: '跨日计划重新可执行' },
        ],
        validation: {
          overall: 'PASS',
          checks: [
            { checkId: 'alt_road_open', label: '绕行道路开放', status: 'PASS' },
            { checkId: 'drive_limit', label: '改住后驾驶未超限', status: 'PASS' },
            { checkId: 'hotel_ok', label: '替代住宿可确认', status: 'PASS' },
            { checkId: 'next_day_ok', label: '次日核心活动仍可履约', status: 'PASS' },
          ],
        },
      },
      {
        optionId: 'opt_cancel_highlands_leg',
        title: '取消高地段，改南岸缓冲日',
        changes: [
          {
            changeType: 'REPLACE_DAY_PLAN',
            targetEntityType: 'DAY',
            targetEntityId: 'day_3',
            description: '高地穿越改为南岸低强度日',
          },
        ],
        expectedOutcome: {
          completionProbability: 0.93,
          riskLevel: 'LOW',
          costImpact: 0,
        },
        tradeoffs: [
          { dimension: 'EXPERIENCE', direction: 'WORSE', summary: '失去高地路段体验' },
          { dimension: 'FLEXIBILITY', direction: 'BETTER', summary: '天气窗口更宽松' },
        ],
        validation: {
          overall: 'PASS',
          checks: [
            { checkId: 'road_open', label: '南岸道路开放', status: 'PASS' },
            { checkId: 'hotel_ok', label: '原住宿仍适用', status: 'PASS' },
          ],
        },
      },
    ],
    recommendation: {
      optionId: 'opt_restructure_overnight',
      rationale: ['保留高地意图的同时切断跨日失效链', '验证网关确认绕行与次日履约可行'],
    },
    outcome: {
      schema: DECISION_OUTCOME_SCHEMA,
      decisionId: 'dec_road_closure_overnight_demo',
      tripId: 'trip_is_highlands_demo',
      predictedOutcome: { completionProbability: 0.88, riskLevel: 'MEDIUM', costImpact: 40 },
      reconciliation: 'PENDING',
    },
    contextHash: 'ctx_road_closure_v1',
    ruleVersion,
    modelVersion: 'road_closure_overnight@p0',
    createdAt: '2026-07-17T07:16:00.000Z',
    worldStateVersion: 'ws_demo_road_closure',
  };
}
