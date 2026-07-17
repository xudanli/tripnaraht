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
 * Case 1 — 强风 → 车速下降 → 延误 → 错过最晚签到
 * Wall-clock story: gust after 14:00; high-risk after 15:10; act by 12:35.
 */
export function buildStrongWindAppointmentFixture(): TravelCausalDecision {
  const rules = listTravelCausalRules({
    caseTag: STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
    reviewStatus: 'APPROVED',
  });
  const ruleVersion = composeRuleVersionStamp(rules);

  return {
    schema: TRAVEL_CAUSAL_DECISION_SCHEMA,
    decisionId: 'dec_strong_wind_appointment_demo',
    tripId: 'trip_is_south_coast_demo',
    observationSummary: '南岸强风将在下午增强。',
    rootCause: {
      id: 'node:weather:strong_wind',
      type: 'WEATHER',
      label: '强风',
      state: { gustMps: 27, region: 'south_coast' },
    },
    causalChain: [
      {
        effectId: 'e1',
        fromNodeId: 'node:weather:strong_wind',
        toNodeId: 'node:route:speed',
        relation: 'CAUSES',
        summary: '强风 → 驾驶速度下降',
        confidence: 0.9,
        ruleId: 'is.wind.gust_reduces_speed',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e2',
        fromNodeId: 'node:route:speed',
        toNodeId: 'node:temporal:eta',
        relation: 'AMPLIFIES',
        summary: '驾驶速度下降 → 预计延误约 35 分钟',
        predictedValue: { delayMinutes: 35 },
        confidence: 0.86,
        ruleId: 'is.wind.gust_reduces_speed',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e3',
        fromNodeId: 'node:temporal:eta',
        toNodeId: 'node:activity:glacier_hike',
        relation: 'CAUSES',
        summary: '延误 → 可能错过冰川徒步签到',
        predictedValue: { missProbability: 0.71 },
        confidence: 0.84,
        ruleId: 'is.wind.delay_misses_checkin',
        ruleVersion: '1.0.0',
      },
    ],
    evidenceRefs: [
      'fact:weather.gust_mps',
      'fact:segment.base_duration',
      'fact:activity.checkin_deadline',
    ],
    temporalForecast: {
      schema: TEMPORAL_IMPACT_SCHEMA,
      detectedAt: '2026-07-17T09:40:00.000Z',
      expectedOnsetAt: '2026-07-17T14:00:00.000Z',
      deteriorationAt: '2026-07-17T15:10:00.000Z',
      interventionDeadline: '2026-07-17T12:35:00.000Z',
      expectedResolutionAt: '2026-07-17T20:00:00.000Z',
      confidence: 0.82,
      assumptions: [
        '当前路线与中途瀑布停靠不变',
        '冰川徒步签到窗口不延长',
        '阵风预报误差 ±3 m/s',
      ],
    },
    baselineOutcome: {
      completionProbability: 0.29,
      riskLevel: 'HIGH',
      costImpact: 160,
      arrivalTime: '2026-07-17T15:28:00.000Z',
      metrics: { iceland_miss_prob: 0.71, delay_minutes: 35 },
    },
    doNothingSummary: '什么都不做：活动失约概率 71%，预计损失 €160。',
    interventions: [
      {
        optionId: 'opt_drop_waterfall_stop',
        title: '删除中途瀑布停靠',
        recommended: true,
        changes: [
          {
            changeType: 'REMOVE_STOP',
            targetEntityType: 'ACTIVITY',
            targetEntityId: 'act_seljalandsfoss',
            description: '删除中途瀑布停靠以回收缓冲时间',
          },
        ],
        expectedOutcome: {
          completionProbability: 0.91,
          riskLevel: 'LOW',
          costImpact: 0,
          arrivalTime: '2026-07-17T14:42:00.000Z',
          metrics: { iceland_miss_prob: 0.09 },
        },
        tradeoffs: [
          {
            dimension: 'EXPERIENCE',
            direction: 'WORSE',
            summary: '失去瀑布短停体验',
          },
          {
            dimension: 'RISK',
            direction: 'BETTER',
            summary: '履约风险显著下降',
            magnitude: 0.62,
          },
        ],
        validation: {
          overall: 'PASS',
          verifiedAt: '2026-07-17T09:41:00.000Z',
          checks: [
            { checkId: 'road_open', label: '道路仍开放', status: 'PASS' },
            { checkId: 'drive_limit', label: '驾驶时间未超限', status: 'PASS' },
            { checkId: 'checkin_window', label: '活动签到窗口满足', status: 'PASS' },
            { checkId: 'hotel_ok', label: '不影响今晚住宿', status: 'PASS' },
            { checkId: 'fatigue_ok', label: '成员体力可接受', status: 'PASS' },
          ],
        },
      },
      {
        optionId: 'opt_depart_earlier',
        title: '提前 45 分钟出发',
        changes: [
          {
            changeType: 'SHIFT_DEPARTURE',
            targetEntityType: 'SEGMENT',
            targetEntityId: 'seg_reykjavik_vik',
            description: '出发时间提前 45 分钟',
            patch: { shiftMinutes: -45 },
          },
        ],
        expectedOutcome: {
          completionProbability: 0.86,
          riskLevel: 'MEDIUM',
          costImpact: 0,
          metrics: { iceland_miss_prob: 0.14 },
        },
        tradeoffs: [
          {
            dimension: 'TIME',
            direction: 'WORSE',
            summary: '早晨更紧',
          },
          {
            dimension: 'RISK',
            direction: 'BETTER',
            summary: '履约概率提升',
          },
        ],
        validation: {
          overall: 'PASS',
          checks: [
            { checkId: 'road_open', label: '道路仍开放', status: 'PASS' },
            { checkId: 'checkin_window', label: '活动签到窗口满足', status: 'PASS' },
            { checkId: 'hotel_ok', label: '不影响今晚住宿', status: 'PASS' },
          ],
        },
      },
    ],
    recommendation: {
      optionId: 'opt_drop_waterfall_stop',
      rationale: [
        '无需改变出发节奏即可把失约概率从 71% 降到约 9%',
        '验证网关五项检查全部通过',
      ],
    },
    outcome: {
      schema: DECISION_OUTCOME_SCHEMA,
      decisionId: 'dec_strong_wind_appointment_demo',
      tripId: 'trip_is_south_coast_demo',
      predictedOutcome: {
        completionProbability: 0.91,
        riskLevel: 'LOW',
        costImpact: 0,
      },
      reconciliation: 'PENDING',
    },
    contextHash: 'ctx_strong_wind_v1',
    ruleVersion,
    modelVersion: 'iceland_self_drive_causal@p2',
    ledgerRef: 'ledger:pending',
    canonicalTraceId: 'trace_strong_wind_demo',
    createdAt: '2026-07-17T09:41:00.000Z',
    worldStateVersion: 'ws_demo_strong_wind',
  };
}
