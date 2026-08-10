/**
 * Funnel Drop Reason — 明确样本在哪一步、为什么失效（结构化，不只中文一句）。
 */

import type { DecisionDataFunnelStage, DecisionFunnelFlags } from './decision-data-funnel.util';
import { advanceDecisionDataFunnel } from './decision-data-funnel.util';

export type FunnelDropReasonCode =
  | 'NOT_A_DECISION'
  | 'SAMPLE_INELIGIBLE'
  | 'MISSING_COMPARABLE_SNAPSHOT'
  | 'OUTCOME_NOT_OBSERVABLE'
  | 'OUTCOME_CONTRACT_FAIL'
  | 'ATTRIBUTION_INVALID'
  | 'EVALUATION_INVALID'
  | 'NONE';

export type FunnelDropDetailV1 = {
  droppedAt?: DecisionDataFunnelStage;
  reasonCode: FunnelDropReasonCode;
  reasonZh: string;
  /** 需要再积累的数据类型提示 */
  needDataTypeZh?: string;
};

const STAGE_TO_CODE: Partial<
  Record<DecisionDataFunnelStage, FunnelDropReasonCode>
> = {
  DECISION: 'NOT_A_DECISION',
  ELIGIBLE: 'SAMPLE_INELIGIBLE',
  COMPARABLE: 'MISSING_COMPARABLE_SNAPSHOT',
  OUTCOME_OBSERVABLE: 'OUTCOME_NOT_OBSERVABLE',
  ATTRIBUTION_VALID: 'ATTRIBUTION_INVALID',
  EVALUATION_VALID: 'EVALUATION_INVALID',
};

const NEED_DATA: Record<FunnelDropReasonCode, string | undefined> = {
  NOT_A_DECISION: '完整 Decision 记录（decisionId/options）',
  SAMPLE_INELIGIBLE: '合格 WorldState/Evidence/Canary 准入样本',
  MISSING_COMPARABLE_SNAPSHOT: '同快照 WorldState+Evidence Comparable Snapshot',
  OUTCOME_NOT_OBSERVABLE: '按 Outcome Observation Contract 的真实观测字段',
  OUTCOME_CONTRACT_FAIL: '补齐该 DecisionKey 的必填 Outcome 字段',
  ATTRIBUTION_INVALID: '有效 Attribution（非反事实冒充观测）',
  EVALUATION_INVALID: '可计算 Evaluation（含 Slice 维度）',
  NONE: undefined,
};

export function explainFunnelDrop(
  flags: DecisionFunnelFlags,
  extras?: {
    outcomeContractOk?: boolean;
  },
): FunnelDropDetailV1 {
  const progress = advanceDecisionDataFunnel(flags);
  if (!progress.droppedAt) {
    return {
      reasonCode: 'NONE',
      reasonZh: '未在 Funnel 中途失效',
    };
  }

  let reasonCode =
    STAGE_TO_CODE[progress.droppedAt] ?? ('NONE' as FunnelDropReasonCode);
  let reasonZh = progress.dropReasonZh ?? '未知失效';

  if (
    progress.droppedAt === 'OUTCOME_OBSERVABLE' &&
    extras?.outcomeContractOk === false
  ) {
    reasonCode = 'OUTCOME_CONTRACT_FAIL';
    reasonZh = 'Outcome 观测未满足 Observation Contract';
  }

  return {
    droppedAt: progress.droppedAt,
    reasonCode,
    reasonZh,
    needDataTypeZh: NEED_DATA[reasonCode],
  };
}

export type FunnelDropHistogramV1 = Partial<
  Record<FunnelDropReasonCode, number>
>;

export function histogramFunnelDrops(
  details: FunnelDropDetailV1[],
): FunnelDropHistogramV1 {
  const hist: FunnelDropHistogramV1 = {};
  for (const d of details) {
    if (d.reasonCode === 'NONE') continue;
    hist[d.reasonCode] = (hist[d.reasonCode] ?? 0) + 1;
  }
  return hist;
}
