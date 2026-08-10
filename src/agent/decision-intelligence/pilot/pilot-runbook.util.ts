/**
 * Real Decision Pilot Runbook — 固定运营流程（不新增 Temporal 能力）。
 * Trip Enroll → Decision → Choice → Action → Outcome → Attribution → Evaluation → Dataset
 */

export const PILOT_RUNBOOK_SCHEMA = 'nara.real_decision_pilot_runbook@v1' as const;

export const PILOT_RUNBOOK_STEPS = [
  'TRIP_ENROLL',
  'DECISION',
  'CHOICE',
  'ACTION',
  'OUTCOME',
  'ATTRIBUTION',
  'EVALUATION',
  'DATASET',
] as const;

export type PilotRunbookStep = (typeof PILOT_RUNBOOK_STEPS)[number];

export type PilotRunbookStepDef = {
  step: PilotRunbookStep;
  titleZh: string;
  mustRecord: string[];
  mustNot: string[];
};

export const REAL_DECISION_PILOT_RUNBOOK: {
  schemaId: typeof PILOT_RUNBOOK_SCHEMA;
  version: 1;
  steps: PilotRunbookStepDef[];
} = {
  schemaId: PILOT_RUNBOOK_SCHEMA,
  version: 1,
  steps: [
    {
      step: 'TRIP_ENROLL',
      titleZh: '登记 Pilot Trip',
      mustRecord: ['tripId', 'lifecycle', 'pilotDecisionKeys'],
      mustNot: ['open_temporal', 'add_prediction'],
    },
    {
      step: 'DECISION',
      titleZh: '形成 Decision',
      mustRecord: ['decisionKey', 'decisionId', 'options'],
      mustNot: ['non_pilot_keys'],
    },
    {
      step: 'CHOICE',
      titleZh: '记录用户选择',
      mustRecord: ['userChosenOptionId', 'productionOptionId', 'candidateOptionId'],
      mustNot: ['infer_choice_from_model'],
    },
    {
      step: 'ACTION',
      titleZh: '记录 Action/Receipt',
      mustRecord: ['actionId_or_none', 'appliedToItinerary'],
      mustNot: ['silent_apply'],
    },
    {
      step: 'OUTCOME',
      titleZh: '按 Outcome Observation Contract 观测',
      mustRecord: ['outcomeFields_per_contract', 'observedAt'],
      mustNot: ['counterfactual_as_observed', 'prediction'],
    },
    {
      step: 'ATTRIBUTION',
      titleZh: '归因校验',
      mustRecord: ['attributionKind', 'counterfactualIsNotObserved'],
      mustNot: ['force_attribution_without_evidence'],
    },
    {
      step: 'EVALUATION',
      titleZh: 'Slice 评价',
      mustRecord: ['metrics', 'slice_keys'],
      mustNot: ['global_average_only_conclusion'],
    },
    {
      step: 'DATASET',
      titleZh: '写入高质量 Dataset',
      mustRecord: ['evaluation_valid_episode'],
      mustNot: ['promote_to_temporal_without_readiness'],
    },
  ],
};

export function projectPilotRunbookForObservability(): Record<string, unknown> {
  return {
    schema_id: REAL_DECISION_PILOT_RUNBOOK.schemaId,
    steps: REAL_DECISION_PILOT_RUNBOOK.steps.map((s) => s.step),
  };
}
