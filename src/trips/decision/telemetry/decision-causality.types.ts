/**
 * Decision Causality Layer — 从表层 reasonCodes 到可推断的因果结构
 */

export const DECISION_TELEMETRY_CAUSALITY_SCHEMA = 'tripnara/decision-telemetry-causality/v1' as const;

export type CausalFactorPolarity = 'for' | 'against' | 'neutral';

/** 单因子对本次决策的贡献（可聚合为 population-level 权重） */
export interface DecisionCausalFactor {
  factor_id: string;
  label: string;
  /** 对选择的影响权重 0–1 */
  weight: number;
  polarity: CausalFactorPolarity;
  /** 若移除该因子，选择概率预估变化（负值 = 选择率下降） */
  counterfactual_delta_if_absent?: number;
}

/**
 * 因果结构 — 回答「为什么发生」，而非仅记录「发生了什么」
 */
export interface DecisionCausalStructure {
  schema: typeof DECISION_TELEMETRY_CAUSALITY_SCHEMA;
  surface_reason_codes: string[];
  active_factors: DecisionCausalFactor[];
  /** 与 Policy→Plan→Execution 因果链对齐 */
  causality_id?: string;
  /** 系统对该因果解释的信心 0–1 */
  confidence: number;
}
