/**
 * Decision State Object (DSO)
 *
 * 统一决策状态结构 - 所有 Agent 共享
 * Phase 2.1: Decision Kernel 中心化架构
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 * 映射: OrchestratorState / LangGraphState → DecisionState
 */

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
}

/** 系统状态 */
export interface SystemState {
  requestId: string;
  currentPhase?: string;
  startedAt?: string;
  lastUpdatedAt?: string;
}

/** 约束报告（Constraint Engine 输出） */
export interface ConstraintReport {
  feasible: boolean;
  violations: Array<{ type: string; severity: 'HARD' | 'SOFT'; detail: string }>;
  feasibleActions?: string[];
}

/** 优化提示（Optimization Engine 输出，给 LLM 的趋势信息） */
export interface OptimizationHints {
  safetyTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  fatigueTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  weightSummary?: Record<string, number>;
  strategyDirection?: string;
}

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

  /** Context Package（Context Engine 构建） */
  contextPackage?: unknown;

  /** 兼容：关联 request_id 便于与现有 OrchestratorState 映射 */
  requestId?: string;
}

/** 从 OrchestratorState 投影为 DecisionState 的辅助类型 */
export type DecisionStatePatch = Partial<DecisionState>;
