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
    party?: { count: number; fitness_level?: string };
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
