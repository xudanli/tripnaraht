/**
 * Decision Data Funnel：
 * Raw → Decision → Eligible → Comparable → Outcome Observable → Attribution Valid → Evaluation Valid → Disagreement
 */

export const DECISION_DATA_FUNNEL_STAGES = [
  'RAW',
  'DECISION',
  'ELIGIBLE',
  'COMPARABLE',
  'OUTCOME_OBSERVABLE',
  'ATTRIBUTION_VALID',
  'EVALUATION_VALID',
  'DISAGREEMENT',
] as const;

export type DecisionDataFunnelStage = (typeof DECISION_DATA_FUNNEL_STAGES)[number];

export type DecisionFunnelFlags = {
  isDecision: boolean;
  isEligible: boolean;
  isComparable: boolean;
  outcomeObservable: boolean;
  attributionValid: boolean;
  evaluationValid: boolean;
  hasDisagreement: boolean;
};

export type DecisionFunnelProgressV1 = {
  stageReached: DecisionDataFunnelStage;
  flags: DecisionFunnelFlags;
  droppedAt?: DecisionDataFunnelStage;
  dropReasonZh?: string;
};

export function advanceDecisionDataFunnel(
  flags: DecisionFunnelFlags,
): DecisionFunnelProgressV1 {
  const steps: Array<{
    stage: DecisionDataFunnelStage;
    ok: boolean;
    reasonZh: string;
  }> = [
    { stage: 'RAW', ok: true, reasonZh: '' },
    {
      stage: 'DECISION',
      ok: flags.isDecision,
      reasonZh: '未形成 Decision',
    },
    {
      stage: 'ELIGIBLE',
      ok: flags.isEligible,
      reasonZh: '未通过 SampleEligibility',
    },
    {
      stage: 'COMPARABLE',
      ok: flags.isComparable,
      reasonZh: '缺少可比 Snapshot',
    },
    {
      stage: 'OUTCOME_OBSERVABLE',
      ok: flags.outcomeObservable,
      reasonZh: 'Outcome 不可观测',
    },
    {
      stage: 'ATTRIBUTION_VALID',
      ok: flags.attributionValid,
      reasonZh: 'Attribution 无效',
    },
    {
      stage: 'EVALUATION_VALID',
      ok: flags.evaluationValid,
      reasonZh: 'Evaluation 无效',
    },
    {
      stage: 'DISAGREEMENT',
      ok: true,
      reasonZh: '',
    },
  ];

  let stageReached: DecisionDataFunnelStage = 'RAW';
  for (const step of steps) {
    if (!step.ok) {
      return {
        stageReached,
        flags,
        droppedAt: step.stage,
        dropReasonZh: step.reasonZh,
      };
    }
    stageReached = step.stage;
  }

  /** DISAGREEMENT 是记录标记，不要求必须有分歧才算到达 */
  if (!flags.hasDisagreement) {
    return {
      stageReached: 'EVALUATION_VALID',
      flags,
    };
  }
  return { stageReached: 'DISAGREEMENT', flags };
}

export type FunnelCountsV1 = Record<DecisionDataFunnelStage, number>;

export function countDecisionDataFunnel(
  progresses: DecisionFunnelProgressV1[],
): FunnelCountsV1 {
  const counts = Object.fromEntries(
    DECISION_DATA_FUNNEL_STAGES.map((s) => [s, 0]),
  ) as FunnelCountsV1;
  for (const p of progresses) {
    const idx = DECISION_DATA_FUNNEL_STAGES.indexOf(p.stageReached);
    for (let i = 0; i <= idx; i++) {
      counts[DECISION_DATA_FUNNEL_STAGES[i]] += 1;
    }
  }
  return counts;
}
