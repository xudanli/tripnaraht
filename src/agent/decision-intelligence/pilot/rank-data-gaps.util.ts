/**
 * Funnel Drop 数量与影响排序 → Top Observation/Data Gap（研发任务唯一来源）。
 */

import type {
  FunnelDropDetailV1,
  FunnelDropReasonCode,
} from './funnel-drop-reason.util';
import { histogramFunnelDrops } from './funnel-drop-reason.util';

export type RankedDataGapV1 = {
  reasonCode: FunnelDropReasonCode;
  count: number;
  /** 简单影响分：count * stageWeight */
  impactScore: number;
  needDataTypeZh: string;
  suggestedDevTaskZh: string;
};

const IMPACT_WEIGHT: Partial<Record<FunnelDropReasonCode, number>> = {
  OUTCOME_NOT_OBSERVABLE: 5,
  OUTCOME_CONTRACT_FAIL: 5,
  SAMPLE_INELIGIBLE: 4,
  MISSING_COMPARABLE_SNAPSHOT: 4,
  ATTRIBUTION_INVALID: 3,
  EVALUATION_INVALID: 3,
  NOT_A_DECISION: 2,
};

const TASK_ZH: Partial<Record<FunnelDropReasonCode, string>> = {
  OUTCOME_NOT_OBSERVABLE: '补齐 Outcome 观测采集与回写链路',
  OUTCOME_CONTRACT_FAIL: '按 DecisionKey Contract 补必填 Outcome 字段',
  SAMPLE_INELIGIBLE: '提升 WorldState/Evidence 质量与 Canary 准入率',
  MISSING_COMPARABLE_SNAPSHOT: '确保 Prod/Cand 共用 Snapshot 落盘',
  ATTRIBUTION_INVALID: '修复 Attribution 校验与反事实隔离',
  EVALUATION_INVALID: '修复 Evaluation/Slice 计算缺口',
  NOT_A_DECISION: '补 Decision 结构化落库',
};

export function rankFunnelDropGaps(
  details: FunnelDropDetailV1[],
): RankedDataGapV1[] {
  const hist = histogramFunnelDrops(details);
  const ranked: RankedDataGapV1[] = [];
  for (const [code, count] of Object.entries(hist) as Array<
    [FunnelDropReasonCode, number]
  >) {
    if (!count) continue;
    const weight = IMPACT_WEIGHT[code] ?? 1;
    const need =
      details.find((d) => d.reasonCode === code)?.needDataTypeZh ??
      code;
    ranked.push({
      reasonCode: code,
      count,
      impactScore: count * weight,
      needDataTypeZh: need,
      suggestedDevTaskZh: TASK_ZH[code] ?? `修复 ${code} 相关数据缺口`,
    });
  }
  return ranked.sort((a, b) => b.impactScore - a.impactScore);
}
