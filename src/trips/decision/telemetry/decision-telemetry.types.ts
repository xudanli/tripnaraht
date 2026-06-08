/**
 * Decision Telemetry — 决策仪表层契约（Instrumentation → Intelligence）
 *
 * 五层结构：
 * 1. Context   — 决策环境
 * 2. Candidates — 可对比反事实候选
 * 3. Decision  — 实际选择
 * 4. Causality — 因果结构（非仅 reasonCodes）
 * 5. Outcome   — 归一化结果
 */

import type { DecisionAction, DecisionSource, DecisionStage } from '../shared/decision-result.types';
import type { DecisionPointType } from '../interfaces/decision-logging.interface';
import type { DecisionContextLayer } from './decision-context.types';
import type { DecisionCausalStructure } from './decision-causality.types';
import type { DecisionNormalizedOutcome } from './decision-outcome-normalized.types';
import type { CandidateCounterfactualProjection } from './decision-counterfactual.types';

/** 埋点事件来源 */
export type DecisionTelemetrySource = 'user' | 'system' | 'agent';

/** 候选选项 — 必须携带反事实投影才可进入 intelligence-grade 样本 */
export interface DecisionTelemetryCandidate {
  optionId: string;
  label: string;
  description?: string;
  characteristics?: Record<string, unknown>;
  supplierId?: string;
  rejected?: boolean;
  rejectionReasonCodes?: string[];
  /** 反事实：若选此选项会发生什么 */
  counterfactual?: CandidateCounterfactualProjection;
}

export interface DecisionTelemetryDecision {
  optionId: string;
  action: DecisionAction;
  selectedAt: string;
  confidenceLevel?: number;
}

export interface DecisionTelemetryReasons {
  reasonCodes: string[];
  userReasoning?: string;
  rejectionByOption?: Record<string, string[]>;
}

/** @deprecated 使用 DecisionNormalizedOutcome */
export interface DecisionTelemetryOutcome extends DecisionNormalizedOutcome {
  actualCharacteristics?: Record<string, unknown>;
}

/**
 * 统一决策埋点事件
 */
export interface DecisionTelemetryEvent {
  eventId?: string;
  userId?: string;
  tripId?: string;
  countryCode?: string;
  routeDirectionId?: string;
  decisionPoint: DecisionPointType | string;
  decisionStage?: DecisionStage;
  decisionSource?: DecisionSource;
  persona?: string;

  /** 决策环境 — 因果重建必需 */
  context: DecisionContextLayer;

  decision: DecisionTelemetryDecision;
  candidates: DecisionTelemetryCandidate[];
  reasons: DecisionTelemetryReasons;

  /** 因果结构 — 从 reasonCodes + context 提炼 */
  causality?: DecisionCausalStructure;

  /** 归一化结果（可后续补录） */
  outcome?: DecisionNormalizedOutcome;

  systemRecommendation?: {
    optionId: string;
    rationale: string;
  };
  alignmentScore?: number;
  source: DecisionTelemetrySource;
  metadata?: Record<string, unknown>;
}

export interface DecisionTelemetryRecordResult {
  decisionLogId: string;
  eventId: string;
  completeness: DecisionTelemetryCompleteness;
  causality_id: string;
  intelligence_grade: 'logging' | 'instrumented' | 'intelligence';
}

/** 完整度 — 区分 logging vs intelligence-grade 样本 */
export interface DecisionTelemetryCompleteness {
  hasDecision: boolean;
  hasCandidates: boolean;
  hasReasons: boolean;
  hasOutcome: boolean;
  hasContext: boolean;
  hasCounterfactuals: boolean;
  hasCausality: boolean;
  /** 0–1 基础四元组 */
  score: number;
  /** 0–1 含 context + counterfactual + causality */
  intelligence_score: number;
}
