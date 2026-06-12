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
import type { ResearchAssetScope } from '../../../agent/utils/research-asset-scope.util';
import type { UserCognitiveProfile } from '../../../agent/memory/experience-replay/user-cognitive-profile.types';
import type { ResearchConflictNegotiationReport } from '../../../agent/teams/research/research-conflict-negotiation.types';
import type { PersonaClosureAudit } from '../../../trips/decision/shared/persona-closure.types';

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
    message?: string;
    /** 与 TripPlanRequest.trip_id 对齐：有值时 itinerary.generate 可从库合并 TripDay/ItineraryItem */
    trip_id?: string;
    party?: { count: number; fitness_level?: string; has_elderly?: boolean };
    party_profile?: { risk_tolerance?: string; fitness?: string };
    constraints?: { vehicle_type?: '2WD' | '4WD' };
    /** 行程总预算（元或与上游一致）；5.0 Leader 预分桶与财务审计用 */
    total_budget?: number;
    totalBudget?: number;
    budget?: { total?: number; amount?: number; currency?: string };
  };
  /** VERIFY 等阶段可选：用户画像偏好（如 transport_preferences） */
  user_profile?: {
    preferences?: {
      transport_preferences?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  /** 与 route_and_run `conversation_context.recent_messages` 对齐，供 RESEARCH 指代消解 / 坐标回溯 */
  recent_messages?: string[];
  /**
   * `transport_only`：澄清起终点后仅重跑 transport.search，并合并 `priorResearchData`（避免整段 RESEARCH 重跑）。
   * `scoped_partial`：合并 `priorResearchData` 后，仅对 `researchScopesToRecompute` 列出的资产域重跑对应子管线（2.0 局部回溯）。
   */
  researchMode?: 'full' | 'transport_only' | 'scoped_partial';
  priorResearchData?: Record<string, unknown>;
  /** `researchMode === 'scoped_partial'` 时必填：要重新收集的研究资产域（与 `research-asset-scope.util` 对齐） */
  researchScopesToRecompute?: ResearchAssetScope[];
  /**
   * invalidation COW：无效化**前**的完整 research 快照，供 `live_hotel_refresh` 失败时按 hotel 域缝合或 Trace 对齐。
   */
  researchAtomicRollbackSnapshot?: Record<string, unknown>;
  /**
   * 4.0 Experience Replay：由 `MemoryKernelService` 在 `MEMORY_KERNEL_LOAD_BUDGET_MS` 内注入的非 PII 认知侧写；
   * 缺省或未加载成功时不存在（走 3.0 无记忆路径）。
   */
  userCognitiveProfile?: UserCognitiveProfile;
  /** Persona closure 收敛审计（FINALIZE / three-guardians 写入） */
  personaClosureAudit?: PersonaClosureAudit;
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
  /** itinerary.generate 治理输出：与 `days` 并列的控制面，勿从 metadata 推断 */
  resultType?: import('../../../world/operational/execution-governance.contract').ItineraryGenerateResultType;
  partialExecutionState?: import('../../../world/operational/execution-governance.contract').PartialExecutionState;
  executionDecision?: import('../../../world/operational/execution-governance.contract').ExecutionDecision;
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
  /** BCP-47 / 应用 locale，用于澄清文案矩阵（如 zh-CN、en-US） */
  locale?: string;
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

/** Harness `__research_asset_manifest` → NARRATOR / BFF 结构化提示（2.0） */
export type NarrationResearchUiHint = {
  scope: string;
  freshness: string;
  message_zh: string;
  attribution?: string;
};

/** NARRATE：语气修饰符（2.0 manifest + 3.0 EBP 立场映射） */
export type NarrationVoiceToneModifier =
  | 'neutral'
  | 'reassuring_transparency'
  | 'professional_authoritative'
  | 'rational_economical'
  /** 5.1：预算仲裁紧缩重跑后，强调高性价比与透明「省钱」叙事 */
  | 'rational_frugal'
  /** 6.1：挫败感熔断时，共情安抚优先于「理性节俭」表功 */
  | 'empathetic_reassurance';

/** NARRATE 阶段叙述输出（P3 C） */
export interface NarrationLike {
  user_friendly_summary: string;
  day_by_day_narrative: Array<{ day: number; date: string; narrative: string }>;
  highlights: string[];
  tips: string[];
  warnings?: NarrationWarningEntry[];
  /** 研究域新鲜度/归因的结构化提示（UI 卡片绑定） */
  research_ui_hints?: NarrationResearchUiHint[];
  /** 语气修饰：研究新鲜度 / EBP 协商立场（BFF / TTS / UI） */
  voice_tone_modifier?: NarrationVoiceToneModifier;
  /** BFF：EBP / 冲突协商后的视觉层建议（多模态前端） */
  visual_hint?: string;
  /** BFF：语音韵律 / TTS 建议（多模态语音） */
  audio_prosody?: string;
  /** OPTIMIZE/CGUS 决策判决书中文摘要 */
  optimization_decision_narration_zh?: string;
  /** 因果保护叙事（内核 trace 编译） */
  causal_protection_summary_zh?: string;
  /** 结构化因果链（UI / 审计） */
  causal_chain?: import('../../../trips/decision/narration/causal-chain.types').CausalChain;
  /** Decision OS v2：稀疏区 / 开放世界 / 留白叙事摘要 */
  decision_context_summary?: {
    sparse_profile_id?: string;
    intentional_slack_count?: number;
    open_world_stub_count?: number;
    mention_count?: number;
  };
  /** unified-explainability@v1（与 explain.unified / decision.explainForHuman 同源） */
  unified_explainability?: import('../../../trips/decision/explainability/unified-explainability.types').UnifiedExplainabilityEnvelopeV1;
  /** 客户端 payload：envelope 仅在 explain.unified */
  unified_explainability_ref?: import('../../../trips/decision/explainability/dedupe-unified-explainability-client-payload.util').UnifiedExplainabilityClientRef;
  /** 三人格确定性叙事（envelope 投影） */
  guardian_narrative_zh?: {
    abu: string;
    drdre: string;
    neptune: string;
  };
  /** 锚定 reasonCodes / evidenceRefs 的风险摘要 */
  risk_highlights?: Array<{
    risk: string;
    severity: 'high' | 'medium' | 'low';
    explanation: string;
    reason_codes?: string[];
    evidence_refs?: string[];
  }>;
  /** 路段级证据卡片（坡度/步行/避坑；schema tripnara.leg_evidence@v1） */
  leg_evidence_cards?: Array<{
    schema: 'tripnara.leg_evidence@v1';
    leg_id: string;
    day_index: number;
    day_date: string;
    from_label: string;
    to_label: string;
    eta_minutes?: number;
    distance_meters?: number;
    transport_mode?: 'walk' | 'drive' | 'transit' | 'mixed';
    summary_zh: string;
    pitfall_tips_zh?: string[];
    severity?: 'info' | 'warn';
  }>;
  /** POI 级避坑卡片（入口/排队/预约；schema tripnara.poi_pitfall@v1） */
  poi_pitfall_cards?: Array<{
    schema: 'tripnara.poi_pitfall@v1';
    poi_id: string;
    place_id?: string;
    label_zh: string;
    day_index?: number;
    day_date?: string;
    tips_zh: string[];
    source: 'heuristic' | 'rag_snippet' | 'item_notes';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  /** 订票优先级清单（schema tripnara.booking_priority_list@v1；与 ui_display 同源） */
  booking_priority_list?: {
    schema: 'tripnara.booking_priority_list@v1';
    tripId: string;
    generatedAt: string;
    items: Array<{
      id: string;
      category: string;
      title: string;
      associatedDayNumber: number;
      urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
      timing: {
        bookByDate: string;
        opensAtLocal?: string;
        countdownSeconds: number;
      };
      actionPayload: {
        officialBookingUrl: string;
        bookingGuideHtml?: string;
        calendarReminderDeeplink: string;
      };
    }>;
  };
  /** TTS 口语叙事（schema tripnara.voice_payload@v1） */
  voice_payload?: {
    schema: 'tripnara.voice_payload@v1';
    text: string;
    tone_modifier: string;
    audio_config: {
      voice_id?: string;
      speed_factor: number;
      pitch_setting: 'low' | 'medium' | 'high';
      emotions: string[];
    };
  };
}

/** NARRATE 阶段执行器上下文（P3 C：orchestratorState 含 itinerary/gate_result/decision_log） */
export interface NarrateExecutorContext extends PhaseExecutorContext {
  /** OrchestratorState 快照，供 NarratorAgent.narrate 使用 */
  orchestratorState?: unknown;
  /**
   * MAT 3.0+：Research Team EBP 协商报告；由编排器从 `research_data.__research_conflict_negotiation` 提取后注入，
   * NarrateExecutor 写入 `orchestratorState.narration_research_conflict` 供 Narrator 消费。
   */
  researchConflict?: ResearchConflictNegotiationReport;
}

/** NARRATE 阶段执行器（P3 C） */
export interface INarrateExecutor {
  execute(
    dso: DecisionState,
    ctx: NarrateExecutorContext,
  ): Promise<{ narration: NarrationLike }>;
}

