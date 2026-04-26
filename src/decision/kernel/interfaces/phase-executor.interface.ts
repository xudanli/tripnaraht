/**
 * Phase Executor 接口
 *
 * Kernel 业务逻辑迁移：Kernel 定义能力契约，Agent 模块提供实现
 * 参考：docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import type {
  DecisionState,
  ConstraintReport,
  EnvironmentState,
  PendingMigrationRequest,
  RepairEscalationPlan,
  VerificationIssue,
} from '../decision-state.types';
import type { RepairTrace, SimulatedRepairTrace } from '../../../agent/services/route-feasibility.types';

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

/** PLAN_GEN 执行器在空草案时回传的说明，供 Kernel 写入 `systemState.planGenTerminalFailure` */
export interface PlanGenEmptyDraftExplanation {
  code: string;
  message: string;
  detail?: string;
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
    /** 仅当 `itinerary.days` 为空时建议填充 */
    emptyDraftExplanation?: PlanGenEmptyDraftExplanation;
  }>;
}

/** VERIFY 阶段执行器 */
export interface IVerifyExecutor {
  execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    issues: VerificationIssue[];
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
    /** Strongly-typed proof trace emitted by tactics (for RL/audit). */
    repairTraces?: RepairTrace[];
    /** 物理极限等：写入 DSO.verification.escalationPlan（由 Kernel merge） */
    escalationPlan?: RepairEscalationPlan;
    /** 如营业时间弱证据：追加 ADVISORY issue 并下调 confidence */
    postRepairAdvisories?: VerificationIssue[];
    /** 跨天迁移建议：由 Kernel 合并入 DSO.systemState.pendingMigrations */
    pendingMigrations?: PendingMigrationRequest[];
    /** 绝境可恢复 / 需用户介入：合并入 DSO.systemState.recoverySignal */
    recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';
  }>;
}

/** INTAKE 缺口类型 */
export type IntakeGapType =
  | 'MISSING_DESTINATION'
  | 'MISSING_DATES'
  | 'MISSING_CONSTRAINTS'
  | 'MISSING_PREFERENCES'
  | 'SPEC_TYPE_ERROR'
  | 'INTENT_COMPILE_ERROR';

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
    /** INTAKE 阶段形式化仿真（与真实 RepairTrace 同构，供 EARLY_WARNING / 叙事复用） */
    simulation?: { simulatedRepairTraces: SimulatedRepairTrace[] };
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

/**
 * Structured narration warning for UI “evidence cards” (Level 4).
 * Plain `string` entries remain supported for legacy L3 / escalation lines.
 */
export interface NarrationEvidenceCard {
  kind: 'iron_shield_evidence';
  message: string;
  severity: 'HARD' | 'SOFT';
  rule_id: string;
  rule_name?: string;
  /** 1=fact, 2=impact, 3=authority — see `persuasion-tier.util.ts` */
  persuasion_tier?: 1 | 2 | 3;
  /** Physics / provenance bundle (solar_physics, weather_physics, …) */
  evidence: Record<string, unknown>;
  narrator_hint_rendered?: string;
}

export type NarrationWarningEntry = string | NarrationEvidenceCard;

/** NARRATE 阶段叙述输出（P3 C） */
export interface NarrationLike {
  user_friendly_summary: string;
  day_by_day_narrative: Array<{ day: number; date: string; narrative: string }>;
  highlights: string[];
  tips: string[];
  warnings?: NarrationWarningEntry[];
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

