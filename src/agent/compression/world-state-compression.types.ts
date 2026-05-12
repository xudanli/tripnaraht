// src/agent/compression/world-state-compression.types.ts
/**
 * World State Compression：把天气 / 路况 / 预警压成可进 prompt 的操作风险面，避免 token 膨胀。
 */
export type TravelOperationalRiskLevel = 'low' | 'medium' | 'high' | 'extreme';

export interface TravelOperationalWorldCompressedV1 {
  travelOperationalRisk: TravelOperationalRiskLevel;
  blockingFactors: string[];
  executionAdvice: string[];
}

/** 单条「负向操作约束」——来自 Decision Memory ring（rejected / failed） */
export interface OperationalNegativeConstraintLineV1 {
  decisionType: string;
  outcome: string;
  causalityId: string;
  /** 给 LLM 的一行公理化约束 */
  constraintLine: string;
  causedBySummary: string[];
  rationaleSummary: string[];
}

/**
 * 当前 request ring 上的负向约束压缩结果（供 ExecutionContext / Context Package 消费）。
 */
export interface OperationalNegativeConstraintsV1 {
  revision: 'v1';
  scope: 'current_request_ring';
  lines: OperationalNegativeConstraintLineV1[];
  /** 整段 Markdown，可直接贴入 system / reasoning */
  markdownBlock: string;
}
