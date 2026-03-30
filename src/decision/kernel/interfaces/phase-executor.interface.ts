/**
 * Phase Executor 接口
 *
 * Kernel 业务逻辑迁移：Kernel 定义能力契约，Agent 模块提供实现
 * 参考：docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import type { DecisionState, ConstraintReport, EnvironmentState } from '../decision-state.types';

/** 阶段执行上下文 */
export interface PhaseExecutorContext {
  requestId: string;
  routeDirectionId?: string;
  userId?: string;
  /** RESEARCH 阶段产出，GATE_EVAL/PLAN_GEN 等下游阶段需要 */
  researchData?: Record<string, unknown>;
  /** GATE_EVAL 阶段产出，PLAN_GEN/REPAIR 需要 */
  gateResult?: GateResultLike;
  /** PLAN_GEN 阶段产出，VERIFY/REPAIR 需要 */
  itinerary?: ItineraryLike;
  /** REPAIR 阶段产出（替代方案） */
  alternatives?: { alternative_pois: unknown[]; alternative_routes: unknown[] };
  /** 兼容 TripPlanRequest 结构 */
  tripPlanRequest?: {
    destination?: string | { lat: number; lng: number };
    origin?: string | { lat: number; lng: number };
    date_range?: { start_date: string; end_date: string };
    start_date?: string;
    days?: number;
    mode?: string;
    party?: { count: number; fitness_level?: string; has_elderly?: boolean };
    party_profile?: { risk_tolerance?: string; fitness?: string };
  };
}

/** GateResult 兼容结构（避免直接依赖 trip-plan.interface） */
export interface GateResultLike {
  gate_result: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
  violations: Array<{ type: string; severity: 'HARD' | 'SOFT'; detail: string }>;
  required_adjustments: Array<{ action: string; why: string }>;
  confidence: number;
}

/** 与 `OrchestratorState.alternatives` / TD-03 计数口径一致，写入 DSO `tripState.orchestratorAlternatives` */
export type OrchestratorAlternativesLike = {
  alternative_pois: unknown[];
  alternative_routes: unknown[];
};

/** Itinerary 兼容结构 */
export interface ItineraryLike {
  request_id: string;
  days: Array<{ date: string; items: unknown[] }>;
  metadata?: Record<string, unknown>;
}

/** RESEARCH 阶段执行器 */
export interface IResearchExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    researchData: Record<string, unknown>;
    environmentPatch: Partial<EnvironmentState>;
  }>;
}

/** GATE_EVAL 阶段执行器 */
export interface IGateEvalExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    constraints: ConstraintReport;
    gateResult: GateResultLike;
    /** BLOCK 时建议带出可执行替代；缺省由 Kernel 写入可读 fallback 至 DSO */
    alternatives?: OrchestratorAlternativesLike;
  }>;
}

/** PLAN_GEN 阶段执行器 */
export interface IPlanGenExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    itinerary: ItineraryLike;
    planDraft: unknown;
  }>;
}

/** VERIFY 阶段执行器 */
export interface IVerifyExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    issues: string[];
    confidenceDelta: number;
  }>;
}

/** REPAIR 阶段执行器 */
export interface IRepairExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    itinerary?: ItineraryLike;
    repairApplied: boolean;
  }>;
}

/** INTAKE 缺口类型 */
export type IntakeGapType = 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';

/** INTAKE 阶段执行器上下文扩展（P3 B: tripPlanRequest + orchestratorState 由 Conductor 传入） */
export interface IntakeExecutorContext extends PhaseExecutorContext {
  /** 已转换的 TripPlanRequest（Conductor 调用 convertToTripPlanRequest 后传入） */
  tripPlanRequest: PhaseExecutorContext['tripPlanRequest'] & { request_id?: string };
  /** OrchestratorState 快照，供 PlannerAgent.analyzeRequest 使用 */
  orchestratorState?: unknown;
}

/** INTAKE 阶段执行器 */
export interface IIntakeExecutor {
  execute(
    dso: DecisionState,
    ctx: IntakeExecutorContext,
  ): Promise<{
    tripPlanRequest: IntakeExecutorContext['tripPlanRequest'];
    gaps: Array<{ type: IntakeGapType; severity: 'HARD' | 'SOFT'; detail: string }>;
    clarificationQuestions: Array<{
      id: string;
      question: string;
      type: string;
      required: boolean;
      options?: unknown[];
      placeholder?: string;
      hint?: string;
      validation?: unknown;
    }>;
    intent?: string;
    candidate_structure?: { suggested_days?: number; suggested_route?: string[]; key_pois?: string[] };
  }>;
}

/** NARRATE 阶段叙述输出（P3 C） */
export interface NarrationLike {
  user_friendly_summary: string;
  day_by_day_narrative: Array<{ day: number; date: string; narrative: string }>;
  highlights: string[];
  tips: string[];
  warnings?: string[];
}

/** NARRATE 阶段执行器上下文（P3 C：orchestratorState 含 itinerary/gate_result/decision_log） */
export interface NarrateExecutorContext extends PhaseExecutorContext {
  /** OrchestratorState 快照，供 NarratorAgent.narrate 使用 */
  orchestratorState?: unknown;
}

/** NARRATE 阶段执行器（P3 C） */
export interface INarrateExecutor {
  execute(
    dso: DecisionState,
    ctx: NarrateExecutorContext,
  ): Promise<{ narration: NarrationLike }>;
}

