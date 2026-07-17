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
 * Case 3 — 睡眠不足 + 徒步 + 连续驾驶 → 疲劳 → 驾驶风险 ↑ → 后续完成率 ↓
 */
export function buildMemberFatigueFixture(): TravelCausalDecision {
  const rules = listTravelCausalRules({
    caseTag: STANDARD_CAUSAL_CASE_IDS.MEMBER_FATIGUE,
    reviewStatus: 'APPROVED',
  });
  const ruleVersion = composeRuleVersionStamp(rules);

  return {
    schema: TRAVEL_CAUSAL_DECISION_SCHEMA,
    decisionId: 'dec_member_fatigue_demo',
    tripId: 'trip_is_party_demo',
    observationSummary: '成员昨晚睡眠不足，今日仍含徒步与长驾驶。',
    rootCause: {
      id: 'node:human:sleep_deficit',
      type: 'HUMAN',
      label: '睡眠不足',
      state: { sleepHours: 4.5, travelerId: 'traveler_a' },
    },
    causalChain: [
      {
        effectId: 'e1',
        fromNodeId: 'node:human:sleep_deficit',
        toNodeId: 'node:human:fatigue',
        relation: 'CAUSES',
        summary: '睡眠不足 + 徒步 + 连续驾驶 → 疲劳累积',
        ruleId: 'is.fatigue.sleep_deficit_raises_risk',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e2',
        fromNodeId: 'node:human:fatigue',
        toNodeId: 'node:route:safety',
        relation: 'AMPLIFIES',
        summary: '疲劳累积 → 驾驶风险增加',
        predictedValue: { riskBand: 'HIGH' },
        ruleId: 'is.fatigue.sleep_deficit_raises_risk',
        ruleVersion: '1.0.0',
      },
      {
        effectId: 'e3',
        fromNodeId: 'node:route:safety',
        toNodeId: 'node:activity:afternoon',
        relation: 'CONSTRAINS',
        summary: '驾驶风险增加 → 后续活动完成率下降',
        predictedValue: { completionProbability: 0.48 },
        ruleId: 'is.fatigue.sleep_deficit_raises_risk',
        ruleVersion: '1.0.0',
      },
    ],
    evidenceRefs: [
      'fact:traveler.sleep_hours',
      'fact:day.hike_minutes',
      'fact:day.drive_minutes',
    ],
    temporalForecast: {
      schema: TEMPORAL_IMPACT_SCHEMA,
      detectedAt: '2026-07-17T06:50:00.000Z',
      expectedOnsetAt: '2026-07-17T11:00:00.000Z',
      deteriorationAt: '2026-07-17T15:00:00.000Z',
      interventionDeadline: '2026-07-17T08:30:00.000Z',
      confidence: 0.76,
      assumptions: [
        '无第二驾驶员可轮换',
        '下午仍保留 3h 户外活动',
        '昨晚睡眠报告可信',
      ],
    },
    baselineOutcome: {
      completionProbability: 0.48,
      riskLevel: 'HIGH',
      costImpact: 0,
      metrics: { fatigue_index: 0.82, driving_risk: 0.74 },
    },
    doNothingSummary: '什么都不做：午后驾驶风险升高，后续活动完成率约 48%。',
    interventions: [
      {
        optionId: 'opt_drop_hike_add_rest',
        title: '取消上午徒步，插入休息后再出发',
        recommended: true,
        changes: [
          {
            changeType: 'REMOVE_ACTIVITY',
            targetEntityType: 'ACTIVITY',
            targetEntityId: 'act_morning_hike',
            description: '取消高负荷徒步',
          },
          {
            changeType: 'INSERT_REST',
            targetEntityType: 'DAY',
            targetEntityId: 'day_2',
            description: '上午增加休息窗',
          },
        ],
        expectedOutcome: {
          completionProbability: 0.84,
          riskLevel: 'MEDIUM',
          metrics: { fatigue_index: 0.45, driving_risk: 0.38 },
        },
        tradeoffs: [
          { dimension: 'EXPERIENCE', direction: 'WORSE', summary: '失去上午徒步' },
          { dimension: 'RISK', direction: 'BETTER', summary: '驾驶与后续完成率改善' },
        ],
        validation: {
          overall: 'PASS',
          checks: [
            { checkId: 'drive_risk', label: '驾驶风险降至可接受', status: 'PASS' },
            { checkId: 'fatigue_ok', label: '成员体力可接受', status: 'PASS' },
            { checkId: 'hotel_ok', label: '不影响今晚住宿', status: 'PASS' },
            { checkId: 'core_activity', label: '核心下午活动仍可履约', status: 'PASS' },
          ],
        },
      },
      {
        optionId: 'opt_swap_driver',
        title: '更换主驾驶并缩短连续驾驶段',
        changes: [
          {
            changeType: 'SWAP_DRIVER',
            targetEntityType: 'TRAVELER',
            targetEntityId: 'traveler_b',
            description: '由第二成员主驾',
          },
        ],
        expectedOutcome: {
          completionProbability: 0.79,
          riskLevel: 'MEDIUM',
        },
        tradeoffs: [
          { dimension: 'FLEXIBILITY', direction: 'NEUTRAL', summary: '依赖第二驾驶员状态' },
        ],
        validation: {
          overall: 'PASS',
          checks: [
            { checkId: 'license_ok', label: '第二驾驶员合规', status: 'PASS' },
            { checkId: 'drive_risk', label: '驾驶风险可接受', status: 'PASS' },
          ],
        },
      },
    ],
    recommendation: {
      optionId: 'opt_drop_hike_add_rest',
      rationale: ['直接切断疲劳累积主因', '保留下午核心体验且验证通过'],
    },
    outcome: {
      schema: DECISION_OUTCOME_SCHEMA,
      decisionId: 'dec_member_fatigue_demo',
      tripId: 'trip_is_party_demo',
      predictedOutcome: { completionProbability: 0.84, riskLevel: 'MEDIUM' },
      reconciliation: 'PENDING',
    },
    contextHash: 'ctx_fatigue_v1',
    ruleVersion,
    modelVersion: 'member_fatigue@p0',
    createdAt: '2026-07-17T06:51:00.000Z',
    worldStateVersion: 'ws_demo_fatigue',
  };
}
