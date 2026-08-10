/**
 * 四个 Pilot DecisionKey 的 Outcome Observation Contract（冻结观测字段，非预测）。
 */

import type { RealDecisionPilotKey } from './pilot-decision-keys.util';

export const OUTCOME_OBSERVATION_CONTRACT_SCHEMA =
  'nara.pilot_outcome_observation_contract@v1' as const;

export type OutcomeObservationFieldV1 = {
  field: string;
  required: boolean;
  descriptionZh: string;
  /** 观测窗口提示（小时），非预测 */
  observeWithinHours?: number;
};

export type OutcomeObservationContractV1 = {
  schemaId: typeof OUTCOME_OBSERVATION_CONTRACT_SCHEMA;
  version: 1;
  decisionKey: RealDecisionPilotKey;
  requiredFields: OutcomeObservationFieldV1[];
  forbiddenAsObserved: Array<'COUNTERFACTUAL' | 'MODEL_PREDICTION' | 'ASSUMED_FILL'>;
};

export const PILOT_OUTCOME_OBSERVATION_CONTRACTS: Record<
  RealDecisionPilotKey,
  OutcomeObservationContractV1
> = {
  pace_preference: {
    schemaId: OUTCOME_OBSERVATION_CONTRACT_SCHEMA,
    version: 1,
    decisionKey: 'pace_preference',
    requiredFields: [
      {
        field: 'day_fatigue_level',
        required: true,
        descriptionZh: '当日主观/报告疲劳档（LOW/MEDIUM/HIGH）',
        observeWithinHours: 36,
      },
      {
        field: 'skipped_or_rushed_count',
        required: true,
        descriptionZh: '跳过或赶场项数量',
        observeWithinHours: 36,
      },
      {
        field: 'user_pace_satisfaction',
        required: false,
        descriptionZh: '用户对节奏满意度（可选）',
        observeWithinHours: 48,
      },
    ],
    forbiddenAsObserved: ['COUNTERFACTUAL', 'MODEL_PREDICTION', 'ASSUMED_FILL'],
  },
  arrival_day_load: {
    schemaId: OUTCOME_OBSERVATION_CONTRACT_SCHEMA,
    version: 1,
    decisionKey: 'arrival_day_load',
    requiredFields: [
      {
        field: 'actual_arrival_local_time',
        required: true,
        descriptionZh: '实际抵达当地时间',
        observeWithinHours: 24,
      },
      {
        field: 'arrival_day_completed_items',
        required: true,
        descriptionZh: '抵达日完成项数',
        observeWithinHours: 36,
      },
      {
        field: 'arrival_day_overload_flag',
        required: true,
        descriptionZh: '是否出现抵达日过载（用户/日志）',
        observeWithinHours: 36,
      },
    ],
    forbiddenAsObserved: ['COUNTERFACTUAL', 'MODEL_PREDICTION', 'ASSUMED_FILL'],
  },
  accommodation_movement: {
    schemaId: OUTCOME_OBSERVATION_CONTRACT_SCHEMA,
    version: 1,
    decisionKey: 'accommodation_movement',
    requiredFields: [
      {
        field: 'hotel_change_executed',
        required: true,
        descriptionZh: '是否实际换住/搬动',
        observeWithinHours: 72,
      },
      {
        field: 'extra_transfer_minutes',
        required: true,
        descriptionZh: '额外换乘/搬运行程分钟',
        observeWithinHours: 72,
      },
      {
        field: 'user_movement_friction',
        required: false,
        descriptionZh: '搬动摩擦反馈（可选）',
        observeWithinHours: 96,
      },
    ],
    forbiddenAsObserved: ['COUNTERFACTUAL', 'MODEL_PREDICTION', 'ASSUMED_FILL'],
  },
  experience_selection: {
    schemaId: OUTCOME_OBSERVATION_CONTRACT_SCHEMA,
    version: 1,
    decisionKey: 'experience_selection',
    requiredFields: [
      {
        field: 'experience_attended',
        required: true,
        descriptionZh: '是否实际参加所选体验',
        observeWithinHours: 48,
      },
      {
        field: 'experience_rating_or_skip_reason',
        required: true,
        descriptionZh: '评分或跳过原因',
        observeWithinHours: 72,
      },
    ],
    forbiddenAsObserved: ['COUNTERFACTUAL', 'MODEL_PREDICTION', 'ASSUMED_FILL'],
  },
};

export type OutcomeContractCheckResult = {
  ok: boolean;
  missingFields: string[];
  violatedForbidden: string[];
};

export function checkOutcomeObservationContract(input: {
  decisionKey: RealDecisionPilotKey;
  observedFields: Record<string, unknown>;
  markedAs?: Array<'COUNTERFACTUAL' | 'MODEL_PREDICTION' | 'ASSUMED_FILL'>;
}): OutcomeContractCheckResult {
  const contract = PILOT_OUTCOME_OBSERVATION_CONTRACTS[input.decisionKey];
  const missingFields = contract.requiredFields
    .filter((f) => f.required)
    .filter((f) => {
      const v = input.observedFields[f.field];
      return v == null || v === '';
    })
    .map((f) => f.field);
  const violatedForbidden = (input.markedAs ?? []).filter((m) =>
    contract.forbiddenAsObserved.includes(m),
  );
  return {
    ok: missingFields.length === 0 && violatedForbidden.length === 0,
    missingFields,
    violatedForbidden,
  };
}
