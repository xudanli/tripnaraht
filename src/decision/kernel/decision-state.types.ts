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
  /** 预算金额 */
  budget?: number;
  /** 灵活度 (0-1) */
  flexibility?: number;
  /** 体能水平 (0-1) */
  fitnessLevel?: number;
  /** 风险承受度 (0-1) */
  riskTolerance?: number;
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
  /** 完成进度 (0-1)（用于 differentiable-decision） */
  completionRate?: number;
  /** 质量评分 (0-1)（用于 differentiable-decision） */
  qualityScore?: number;
  /**
   * Gate BLOCK 时与 Agent `OrchestratorState.alternatives` 对齐的替代项（replan / 持久化出口，供 TD-03 校验）
   */
  orchestratorAlternatives?: {
    alternative_pois: unknown[];
    alternative_routes: unknown[];
  };
}

/** 航班信息（实施例 2 动态重规划） */
export interface EnvironmentFlight {
  flight?: string;
  status?: 'scheduled' | 'delayed' | 'cancelled' | string;
  price?: number;
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
  /** 季节评分 (0-1)（用于 differentiable-decision） */
  seasonScore?: number;
  /** 可达性评分 (0-1)（用于 differentiable-decision） */
  accessibilityScore?: number;
  /** 价格水平 (0-1)（用于 differentiable-decision） */
  priceLevel?: number;
  /** 航班信息（实施例 2：航班取消时触发 REPLAN） */
  flights?: EnvironmentFlight[];
  /** 扩展字段（测试/世界模型推送用，如 _weatherUpdateAt、_simulatedBy） */
  [key: string]: unknown;
}

/** 系统状态 */
export interface SystemState {
  requestId: string;
  currentPhase?: string;
  startedAt?: string;
  lastUpdatedAt?: string;
  /** 专利要求：版本号，用于冲突解决与回滚（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN） */
  version?: number;
  /** 系统置信度 (0-1) */
  confidence?: number;
  /** 迭代计数（用于 differentiable-decision） */
  iterationCount?: number;
}

/** 约束违规项（专利：g_i(s,a) 违反程度，g_i ≤ 0 表示满足） */
export interface ConstraintViolationItem {
  type: string;
  severity: 'HARD' | 'SOFT';
  detail: string;
  /** 约束名称/标识（用于 explainability 模块） */
  constraint?: string;
  /**
   * Phase 2 研究级：违反程度 (0-1)，对应 g_i(s,a) > 0 时的量化值
   * 0 表示无违反，1 表示完全违反。用于约束优化形式 g_i(s,a) ≤ 0
   */
  degree?: number;
}

/** 约束报告（Constraint Engine 输出） */
export interface ConstraintReport {
  feasible: boolean;
  violations: ConstraintViolationItem[];
  feasibleActions?: string[];
  /** 硬约束违反数量（用于 differentiable-decision） */
  hardViolationCount?: number;
  /** 软约束满足率 (0-1)（用于 differentiable-decision） */
  softSatisfactionRate?: number;
  /**
   * 与 `GateResult.gate_result` 对齐（G-01）。
   * 当为 `NEED_USER_CONFIRM` 时，仅用 `feasible`/`violations` 无法与 `ADJUST_REQUIRED` 区分，往返映射时必须显式携带。
   */
  gateOutcome?: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
}

/**
 * 可行域判定：专利形式 g_i(s,a) ≤ 0, ∀i
 * 方案在可行域内 ⟺ 所有约束满足（violations 为空或所有 degree≤0）
 */
export function isInFeasibleRegion(cr: ConstraintReport | undefined): boolean {
  if (!cr) return true;
  const violations = cr.violations ?? [];
  return cr.feasible && violations.every((v) => (v.degree ?? 1) <= 0);
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
  /** Phase 2：不确定性概要，用于信念状态判断 */
  uncertaintyProfile?: UncertaintyProfile;
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

/** History 事件元信息（兼容扩展） */
export interface StateHistoryDeltaMeta {
  request_id?: string;
  trace_id?: string;
  version?: number;
  status?: string;
  signal_type?: string;
  [key: string]: unknown;
}

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
  /** 可选：审计扩展信息（request/trace/version/status 等） */
  meta?: StateHistoryDeltaMeta;
  /** 可选：仲裁/冲突等结构化载荷（如 kernel_arbitration） */
  payload?: unknown;
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

  /**
   * Phase 2 研究级：信念状态 b(s) = P(s|observations) 的工程近似
   * 当世界状态存在不确定性时，通过 Monte Carlo 采样表示信念分布
   * 参考：docs/Decision_OS_技术交底书.md 3.2
   */
  beliefSamples?: BeliefStateSample[];

  /**
   * Phase 2 研究级：不确定性概要，用于快速判断是否启用信念状态逻辑
   * 当 weatherRisk、failureRiskLevel 等存在时，可推断 uncertaintyProfile
   */
  uncertaintyProfile?: UncertaintyProfile;

  /**
   * 用户反馈（专利实施例 6.1.5，FEEDBACK 阶段通过 STATE_UPDATE 写入）
   * 用户查看/采纳/修改行程后的反馈，供反馈学习模块使用
   */
  feedback?: DecisionStateFeedback;

  /** 兼容：关联 request_id 便于与现有 OrchestratorState 映射 */
  requestId?: string;

  /**
   * 旅行本体扩展状态（Data/Logic/Action 融合）
   * 作为 DSO 子状态保存，避免引入平行状态源。
   */
  travelOntologyState?: {
    /** 业务行程 ID（与 trips 域对齐时的主键） */
    tripId?: string;
    nouns?: {
      flights?: Array<{
        id: string;
        flightNo?: string;
        airline?: string;
        from?: string;
        to?: string;
        departureTime?: string;
        arrivalTime?: string;
        price?: number;
      }>;
      hotels?: Array<{
        id: string;
        name?: string;
        checkIn?: string;
        checkOut?: string;
        nightlyPrice?: number;
        roomAvailable?: boolean;
      }>;
      activities?: Array<{
        id: string;
        name?: string;
        type?: string;
        startTime?: string;
        endTime?: string;
        location?: string;
        price?: number;
      }>;
      destination?: {
        id?: string;
        name?: string;
        countryCode?: string;
      };
      transportation?: Array<{
        id?: string;
        mode: 'RAIL' | 'SUBWAY' | 'TAXI' | 'BIKE' | 'BUS' | 'WALK' | 'MIXED';
        provider?: string;
        etaMinutes?: number;
        costEstimate?: number;
      }>;
    };
    verbs?: {
      pending?: Array<{
        actionId: string;
        verb:
          | 'BOOK'
          | 'CANCEL'
          | 'ADJUST'
          | 'NOTIFY'
          | 'OPTIMIZE'
          | 'MODIFY'
          | 'SELECT'
          | 'PAY';
        targetType: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
        targetRef?: string;
        requiresConfirmation: boolean;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      }>;
      committed?: string[];
      rolledBack?: string[];
    };
  };
}

/** 信念状态采样（b(s) 的离散近似） */
export interface BeliefStateSample {
  sampleId: string;
  /** 采样的环境状态摘要 */
  environmentSummary?: Record<string, number>;
  /** 采样的效用或可行性得分 */
  utility?: number;
  feasibilityScore?: number;
}

/** 不确定性概要 */
export interface UncertaintyProfile {
  /** 是否存在显著不确定性（天气、路况、人体能力等） */
  hasUncertainty: boolean;
  /** 主要不确定性来源 */
  sources?: Array<'weather' | 'road' | 'human' | 'budget'>;
  /** 建议采样数量（用于 Monte Carlo） */
  suggestedSampleSize?: number;
}

/**
 * DSO 用户反馈（专利实施例 6.1.5）
 * 用户查看/采纳/修改行程后的反馈，通过 STATE_UPDATE 原子写入 DSO
 */
export interface DecisionStateFeedback {
  /** 是否采纳方案 */
  accepted?: boolean;
  /** 用户修改项（如「将第2天改为酒庄参观」） */
  modifications?: string[];
  /** 满意度评分（如 4.6/5） */
  satisfactionScore?: number;
  /** 行为信号 */
  behaviorSignals?: {
    savePlan?: boolean;
    sharePlan?: boolean;
    exportPlan?: boolean;
  };
  /** 反馈时间 ISO 8601 */
  submittedAt?: string;
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
