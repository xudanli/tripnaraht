/**
 * TemporalScenarioContract — 冻结输入状态 / Evidence / 预测目标 / Horizon / Outcome / 禁止动作。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { RealDecisionPilotKey } from '../pilot/pilot-decision-keys.util';

export const TEMPORAL_SCENARIO_CONTRACT_SCHEMA =
  'nara.temporal_scenario_contract@v1' as const;

export type TemporalScenarioContractV1 = {
  schemaId: typeof TEMPORAL_SCENARIO_CONTRACT_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  decisionKeys: RealDecisionPilotKey[];
  requiredInputState: string[];
  requiredEvidence: string[];
  predictionTargetZh: string;
  horizonHours: number;
  observableOutcomeFields: string[];
  forbiddenActions: string[];
  projectionMethod: 'DETERMINISTIC_RULE';
  /** 第一阶段 */
  visibilityDefault: 'SHADOW';
  proactiveForbidden: true;
  causalModelForbidden: true;
  generalTemporalRuntimeForbidden: true;
};

export const TEMPORAL_SCENARIO_CONTRACTS: Record<
  TemporalScenarioId,
  TemporalScenarioContractV1
> = {
  pace_day_sequence: {
    schemaId: TEMPORAL_SCENARIO_CONTRACT_SCHEMA,
    version: 1,
    scenarioId: 'pace_day_sequence',
    decisionKeys: ['pace_preference'],
    requiredInputState: [
      'trip.lifecycle',
      'plan.daySummariesZh',
      'booking.missingLodgingDays',
    ],
    requiredEvidence: ['pace_signal', 'fatigue_or_skip_signal'],
    predictionTargetZh: '未来 Horizon 内节奏恶化（过载/赶场）方向与大致 onset',
    horizonHours: 48,
    observableOutcomeFields: [
      'day_fatigue_level',
      'skipped_or_rushed_count',
    ],
    forbiddenActions: [
      'direct_apply_itinerary',
      'user_push_notification',
      'auto_replan',
      'bypass_harness_action',
      'proactive_agent',
    ],
    projectionMethod: 'DETERMINISTIC_RULE',
    visibilityDefault: 'SHADOW',
    proactiveForbidden: true,
    causalModelForbidden: true,
    generalTemporalRuntimeForbidden: true,
  },
  arrival_day_recovery: {
    schemaId: TEMPORAL_SCENARIO_CONTRACT_SCHEMA,
    version: 1,
    scenarioId: 'arrival_day_recovery',
    decisionKeys: ['arrival_day_load'],
    requiredInputState: ['trip.lifecycle', 'plan.daySummariesZh'],
    requiredEvidence: ['arrival_time', 'arrival_day_load_signal'],
    predictionTargetZh: '抵达日后恢复窗口内过载风险方向',
    horizonHours: 36,
    observableOutcomeFields: [
      'actual_arrival_local_time',
      'arrival_day_overload_flag',
    ],
    forbiddenActions: [
      'direct_apply_itinerary',
      'user_push_notification',
      'auto_replan',
      'bypass_harness_action',
      'proactive_agent',
    ],
    projectionMethod: 'DETERMINISTIC_RULE',
    visibilityDefault: 'SHADOW',
    proactiveForbidden: true,
    causalModelForbidden: true,
    generalTemporalRuntimeForbidden: true,
  },
  accommodation_move_chain: {
    schemaId: TEMPORAL_SCENARIO_CONTRACT_SCHEMA,
    version: 1,
    scenarioId: 'accommodation_move_chain',
    decisionKeys: ['accommodation_movement'],
    requiredInputState: ['booking.items', 'plan.daySummariesZh'],
    requiredEvidence: ['movement_intent', 'transfer_load'],
    predictionTargetZh: '换住链条摩擦上升方向',
    horizonHours: 72,
    observableOutcomeFields: [
      'hotel_change_executed',
      'extra_transfer_minutes',
    ],
    forbiddenActions: [
      'direct_apply_itinerary',
      'user_push_notification',
      'auto_replan',
      'bypass_harness_action',
      'proactive_agent',
    ],
    projectionMethod: 'DETERMINISTIC_RULE',
    visibilityDefault: 'SHADOW',
    proactiveForbidden: true,
    causalModelForbidden: true,
    generalTemporalRuntimeForbidden: true,
  },
  experience_slotting: {
    schemaId: TEMPORAL_SCENARIO_CONTRACT_SCHEMA,
    version: 1,
    scenarioId: 'experience_slotting',
    decisionKeys: ['experience_selection'],
    requiredInputState: ['plan.daySummariesZh'],
    requiredEvidence: ['experience_slot', 'day_load'],
    predictionTargetZh: '体验穿插导致冲突/错失方向',
    horizonHours: 48,
    observableOutcomeFields: [
      'experience_attended',
      'experience_rating_or_skip_reason',
    ],
    forbiddenActions: [
      'direct_apply_itinerary',
      'user_push_notification',
      'auto_replan',
      'bypass_harness_action',
      'proactive_agent',
    ],
    projectionMethod: 'DETERMINISTIC_RULE',
    visibilityDefault: 'SHADOW',
    proactiveForbidden: true,
    causalModelForbidden: true,
    generalTemporalRuntimeForbidden: true,
  },
};

export function getTemporalScenarioContract(
  scenarioId: TemporalScenarioId,
): TemporalScenarioContractV1 {
  return TEMPORAL_SCENARIO_CONTRACTS[scenarioId];
}
