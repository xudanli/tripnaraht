/**
 * Scenario-scoped Temporal Readiness — 禁止一个全局 Gate 放开全部时序能力。
 */

import type { TemporalThresholdProposalV1 } from './readiness-distribution.util';
import type { RealDecisionPilotKey } from './pilot-decision-keys.util';
import { REAL_DECISION_PILOT_KEYS } from './pilot-decision-keys.util';

export const TEMPORAL_SCENARIO_IDS = [
  'pace_day_sequence',
  'arrival_day_recovery',
  'accommodation_move_chain',
  'experience_slotting',
] as const;

export type TemporalScenarioId = (typeof TEMPORAL_SCENARIO_IDS)[number];

export type TemporalScenarioDefV1 = {
  scenarioId: TemporalScenarioId;
  titleZh: string;
  decisionKeys: RealDecisionPilotKey[];
  /** 该场景关心的 readiness 指标 */
  metricIds: string[];
};

export const TEMPORAL_SCENARIO_DEFS: TemporalScenarioDefV1[] = [
  {
    scenarioId: 'pace_day_sequence',
    titleZh: '多日节奏序列',
    decisionKeys: ['pace_preference'],
    metricIds: [
      'OUTCOME_OBSERVABILITY',
      'OBSERVATION_DENSITY',
      'TEMPORAL_COVERAGE',
      'HIGH_QUALITY_EPISODES',
    ],
  },
  {
    scenarioId: 'arrival_day_recovery',
    titleZh: '抵达日负载与恢复',
    decisionKeys: ['arrival_day_load'],
    metricIds: [
      'OUTCOME_OBSERVABILITY',
      'ATTRIBUTION',
      'WORLDSTATE_EVIDENCE_QUALITY',
    ],
  },
  {
    scenarioId: 'accommodation_move_chain',
    titleZh: '住宿搬动链条',
    decisionKeys: ['accommodation_movement'],
    metricIds: ['OUTCOME_OBSERVABILITY', 'TEMPORAL_COVERAGE', 'ATTRIBUTION'],
  },
  {
    scenarioId: 'experience_slotting',
    titleZh: '体验穿插时序',
    decisionKeys: ['experience_selection'],
    metricIds: [
      'OUTCOME_OBSERVABILITY',
      'WORLDSTATE_EVIDENCE_QUALITY',
      'CASE_REVIEW_COVERAGE',
    ],
  },
];

export type ScenarioReadinessJudgementV1 = {
  scenarioId: TemporalScenarioId;
  titleZh: string;
  qualified: boolean;
  thresholdsFrozen: boolean;
  evidenceZh: string[];
  missingZh: string[];
  /** 全局放开被禁止 */
  globalGateForbidden: true;
};

export function judgeTemporalScenarioReadiness(input: {
  scenarioId: TemporalScenarioId;
  /** 场景当前指标值 */
  metricValues: Record<string, number>;
  /** 仅当该场景提案已人工批准且冻结 */
  approvedProposal?: TemporalThresholdProposalV1 | null;
}): ScenarioReadinessJudgementV1 {
  const def = TEMPORAL_SCENARIO_DEFS.find((d) => d.scenarioId === input.scenarioId)!;
  const evidenceZh: string[] = [];
  const missingZh: string[] = [];

  const frozen =
    input.approvedProposal?.humanReviewStatus === 'APPROVED' &&
    input.approvedProposal.canFreezeThresholds === true &&
    input.approvedProposal.scenarioId === input.scenarioId;

  if (!frozen) {
    missingZh.push('该场景 Threshold Proposal 未人工批准或未冻结');
    evidenceZh.push(
      `scenario=${input.scenarioId} thresholdsFrozen=false；禁止用全局 Gate 放开`,
    );
    return {
      scenarioId: def.scenarioId,
      titleZh: def.titleZh,
      qualified: false,
      thresholdsFrozen: false,
      evidenceZh,
      missingZh,
      globalGateForbidden: true,
    };
  }

  const proposed = input.approvedProposal!.proposed;
  let qualified = true;
  for (const metricId of def.metricIds) {
    const need = proposed[metricId];
    const got = input.metricValues[metricId];
    if (need == null) {
      missingZh.push(`提案缺少指标 ${metricId}`);
      qualified = false;
      continue;
    }
    if (got == null || got < need) {
      qualified = false;
      missingZh.push(
        `${metricId}: value=${got ?? 'n/a'} < threshold=${need}`,
      );
    } else {
      evidenceZh.push(`${metricId}: ${got} ≥ ${need}`);
    }
  }

  evidenceZh.push(
    `decisionKeys=${def.decisionKeys.join(',')}；仅本场景合格，不连带放开其它场景`,
  );

  return {
    scenarioId: def.scenarioId,
    titleZh: def.titleZh,
    qualified,
    thresholdsFrozen: true,
    evidenceZh,
    missingZh,
    globalGateForbidden: true,
  };
}

export function explainWhichTemporalScenariosQualify(input: {
  judgements: ScenarioReadinessJudgementV1[];
}): {
  qualifiedScenarioIds: TemporalScenarioId[];
  notQualifiedScenarioIds: TemporalScenarioId[];
  summaryZh: string[];
  /** DoD：解释资格，而不是全局 true */
  notAGlobalGateFlip: true;
} {
  const qualified = input.judgements.filter((j) => j.qualified);
  const notQualified = input.judgements.filter((j) => !j.qualified);
  const summaryZh = [
    `合格场景 ${qualified.length}/${input.judgements.length}：${qualified.map((j) => j.scenarioId).join(', ') || '无'}`,
    `不合格场景：${notQualified.map((j) => j.scenarioId).join(', ') || '无'}`,
    '禁止单一全局 Temporal Gate 放开全部时序能力。',
  ];
  for (const j of input.judgements) {
    summaryZh.push(
      `[${j.scenarioId}] qualified=${j.qualified}; evidence=${j.evidenceZh.join(' | ')}; missing=${j.missingZh.join(' | ')}`,
    );
  }
  return {
    qualifiedScenarioIds: qualified.map((j) => j.scenarioId),
    notQualifiedScenarioIds: notQualified.map((j) => j.scenarioId),
    summaryZh,
    notAGlobalGateFlip: true,
  };
}

/** 校验 pilot keys 覆盖 */
export function assertPilotKeysCoveredByScenarios(): boolean {
  const covered = new Set(
    TEMPORAL_SCENARIO_DEFS.flatMap((d) => d.decisionKeys),
  );
  return REAL_DECISION_PILOT_KEYS.every((k) => covered.has(k));
}
