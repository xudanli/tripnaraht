/**
 * Decision State Object (DSO)
 *
 * 统一决策状态结构 - 所有 Agent 共享
 * Phase 2.1: Decision Kernel 中心化架构
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 * 映射: OrchestratorState / LangGraphState → DecisionState
 */

import type { ContextPackage } from '../../agent/context-engine/types/context-package.types';
import type { WorldStateSummary } from './world-state-summary.types';

/** 用户意图（从 INTAKE 提取） */
export interface UserIntent {
  destination?: string | { lat: number; lng: number };
  origin?: string | { lat: number; lng: number };
  dateRange?: { startDate: string; endDate: string };
  days?: number;
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  party?: { count: number; fitnessLevel?: string; riskTolerance?: string };
  constraints?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  /** 策略模式（从查询提取） */
  strategyMode?: string;
  /** 缺口列表 */
  gaps?: Array<{ type: string; severity: 'HARD' | 'SOFT'; detail: string }>;
}

/** 行程状态 */
export interface TripState {
  location?: string;
  day?: number;
  fatigue?: number;
  delayMinutes?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** 计划草案 */
  planDraft?: unknown;
  /** 当前行程版本 */
  planVersion?: number;
  /** 预算超支比例 (0-1)，用于 dimensionBreakdown.budget */
  budgetOverrun?: number;
}

/** 环境状态（世界模型输出） */
export interface EnvironmentState {
  countryCode?: string;
  month?: number;
  roadConditions?: Record<string, unknown>;
  weatherRisk?: number;
  routeDirectionId?: string;
  /** 失败风险评估（FailureRiskPredictionService 输出） */
  failureRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 拥挤程度 (0-1)，用于避流维度 */
  crowdLevel?: number;
}

/** 系统状态 */
export interface SystemState {
  requestId: string;
  currentPhase?: string;
  startedAt?: string;
  lastUpdatedAt?: string;
  /** 专利要求：版本号，用于冲突解决与回滚（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN） */
  version?: number;
}

/** 约束报告（Constraint Engine 输出） */
export interface ConstraintReport {
  feasible: boolean;
  violations: Array<{ type: string; severity: 'HARD' | 'SOFT'; detail: string }>;
  feasibleActions?: string[];
}

/**
 * 优化提示（Optimization Engine 输出，给 LLM 的趋势信息）
 *
 * 未来扩展：多目标优化模型
 * ExpectedUtility = w1·Safety + w2·Experience + w3·TimeSlack + w4·Cost - w5·Fatigue - w6·Risk
 */
/** 维度得分（0-1，越高表示该维度风险/惩罚越大） */
export interface DimensionBreakdown {
  /** 疲劳风险 (0-1) */
  fatigue?: number;
  /** 天气风险 (0-1) */
  weather?: number;
  /** 预算超支风险 (0-1) */
  budget?: number;
  /** 避流/拥挤风险 (0-1) */
  crowdAvoidance?: number;
}

/** Monte Carlo 置信区间（专利：世界状态不确定性时） */
export interface MonteCarloConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

export interface OptimizationHints {
  safetyTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  fatigueTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  weightSummary?: Record<string, number>;
  strategyDirection?: string;
  /** 未来：多目标优化标量输出 */
  expectedUtility?: number;
  /** 未来：目标权重 w1..w6（Safety/Experience/TimeSlack/Cost/Fatigue/Risk） */
  expectedUtilityWeights?: Record<string, number>;
  /** 各维度实际得分（解决「疲劳/天气/预算/避流始终为0」） */
  dimensionBreakdown?: DimensionBreakdown;
  /** Monte Carlo 置信区间（专利：不确定性时采用 Monte Carlo 模拟） */
  confidenceInterval?: MonteCarloConfidenceInterval;
  /** 可行性概率 P(all hard constraints satisfied) */
  feasibilityProbability?: number;
}

/** 决策模式（Decision Meta - 系统稳定性关键） */
export type DecisionMetaMode = 'PLAN' | 'ADJUST' | 'EXPLORE' | 'EMERGENCY';

/** 决策阶段（高层面） */
export type DecisionMetaPhase = 'INTAKE' | 'PLAN' | 'VERIFY';

/** 决策策略 */
export type DecisionMetaStrategy = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

/** 决策元数据（模式、阶段、策略 - 极大提升系统稳定性） */
export interface DecisionMeta {
  mode?: DecisionMetaMode;
  phase?: DecisionMetaPhase;
  strategy?: DecisionMetaStrategy;
}

/** 状态变化差分类型（Token 优化：只记录变化） */
export type StateHistoryDeltaType = 'weather' | 'userIntent' | 'delay' | 'constraints' | 'plan' | string;

/** 状态变化差分条目 */
export interface StateHistoryDelta {
  type: StateHistoryDeltaType;
  /** 变化摘要（供 LLM/审计，非全量） */
  summary?: string;
  /** 时间戳 ISO 8601 */
  at: string;
  /** 可选：变化前后快照（用于审计，可压缩） */
  prev?: unknown;
  next?: unknown;
}

/** 状态变化历史（RLHF/异常检测/模型评估核心） */
export type DecisionStateHistory = StateHistoryDelta[];

/**
 * Decision State Object (DSO)
 *
 * 所有 Agent 共享的单一状态结构
 */
export interface DecisionState {
  /** 用户意图 */
  userIntent: UserIntent;

  /** 行程状态 */
  tripState: TripState;

  /** 环境状态 */
  environmentState: EnvironmentState;

  /** 系统状态 */
  systemState: SystemState;

  /** 约束（Constraint Engine 输出） */
  constraints?: ConstraintReport;

  /** 候选方案 */
  candidates?: unknown[];

  /** 优化提示（给 LLM，非公式） */
  optimizationHints?: OptimizationHints;

  /** 风险等级 */
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /** Context Package（Context Engine 构建，强类型） */
  contextPackage?: ContextPackage;

  /** 决策元数据（模式、阶段、策略 - 系统稳定性关键） */
  decisionMeta?: DecisionMeta;

  /** 状态变化摘要（只记录 Δ，Token 优化；RLHF/异常检测核心） */
  history?: DecisionStateHistory;

  /** 当前决策置信度 [0,1]（模型评估、自动学习、异常检测 - Autonomous Agent 必备） */
  confidence?: number;

  /** Scheme C: 世界模型三段式摘要（物理环境、用户能力、路线规则） */
  worldStateSummary?: WorldStateSummary;

  /** 兼容：关联 request_id 便于与现有 OrchestratorState 映射 */
  requestId?: string;
}

/** 从 OrchestratorState 投影为 DecisionState 的辅助类型 */
export type DecisionStatePatch = Partial<DecisionState>;

/** 创建 StateHistoryDelta 的便捷参数 */
export interface AppendHistoryDeltaParams {
  type: StateHistoryDeltaType;
  summary?: string;
  prev?: unknown;
  next?: unknown;
}

/** 状态更新事务（专利权利要求 7：原子提交） */
export interface StateUpdateTransaction {
  requestId: string;
  expectedVersion: number;
  patch: DecisionStatePatch;
  stageOutput?: string;
}

/** 原子提交结果 */
export interface StateCommitResult {
  newState: DecisionState;
  newVersion: number;
  conflict?: boolean;
}

/** 阶段优先级（专利权利要求 6：多模块更新同一字段时，阶段优先级确定最终状态） */
export const STAGE_PRIORITY: Record<string, number> = {
  INTAKE: 1,
  RESEARCH: 2,
  GATE_EVAL: 3,
  CONTEXT_BUILD: 4,
  PLAN_GEN: 5,
  OPTIMIZE: 6,
  VERIFY: 7,
  REPAIR: 8,
  NARRATE: 9,
  FEEDBACK: 10,
  STATE_UPDATE: 0, // 同步步骤，不参与优先级
};

/** 状态提交冲突错误 */
export class StateCommitConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`State commit conflict: expected version ${expectedVersion}, actual ${actualVersion}`);
    this.name = 'StateCommitConflictError';
  }
}
