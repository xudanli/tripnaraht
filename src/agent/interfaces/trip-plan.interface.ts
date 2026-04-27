// src/agent/interfaces/trip-plan.interface.ts

/**
 * TripNARA 统一数据合同（基于 claude.md）
 * 
 * 遵循决策优先（Decision-first）原则：
 * - Should-Exist Gate → 可执行行程（Executable Itinerary）→ 决策日志（Decision Log）
 * - 对外 Verdict ↔ Gate ↔ Policy action：`docs/decision/VERDICT_GATE_POLICY_MAPPING.md`
 */

import { ClarificationQuestion } from './clarification.interface';
import type { TravelActionType } from '../constants/action-execution.constants';
import type { NarrationWarningEntry } from '../../decision/kernel/interfaces/phase-executor.interface';

/**
 * TripPlanRequest（最小字段）
 */
export interface TripPlanRequest {
  request_id: string; // 必填
  /**
   * Optional raw NL message hint.
   * Used by deterministic intake compile / predictive simulation; not a source of truth for downstream execution.
   */
  message?: string;
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  date_range?: {
    start_date: string; // ISO 8601
    end_date: string; // ISO 8601
  };
  start_date?: string; // ISO 8601
  days?: number;
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  party?: {
    count: number;
    has_children?: boolean;
    has_elderly?: boolean;
    fitness_level?: 'low' | 'medium' | 'high';
  };
  // 团队资料（护城河扩展）
  party_profile?: {
    risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    fitness?: 'low' | 'medium' | 'high';
  };
  constraints?: {
    budget?: {
      total?: number;
      currency?: string;
    };
    /**
     * 车辆能力（准入类约束的最小载体）
     * - 用于 F-road / 高地等 4x4 准入判断，以及 Shadow Dry-Run 的 Relaxation Patch
     */
    vehicle_type?: '2WD' | '4WD';
    daily_time_window?: {
      start: string; // HH:mm
      end: string; // HH:mm
    };
    max_ascent_m?: number;
    max_walk_km?: number;
    wheelchair_accessible?: boolean;
    no_stairs?: boolean;
    max_transfers?: number;
    restroom_interval_minutes?: number;
  };
  preferences?: {
    scenic_priority?: boolean;
    efficiency_priority?: boolean;
    avoid_tolls?: boolean;
    avoid_highways?: boolean;
  };
  /**
   * Phase 1 POI：区域意图（与 UserIntent、docs/POI_REGION_INTENT_PHASE1.md 对齐）
   */
  region_id?: string;
  must_include_poi_ids?: string[];
  exclude_poi_ids?: string[];
  total_budget_minutes?: number;
  pace?: 'relaxed' | 'normal' | 'dense';
  style_tags?: string[];
  /**
   * 旅行本体扩展（Travel Vertical Ontology）
   * 用于将业务实体映射到 Agent/Place/Action/Resource/Event。
   */
  ontology_context?: {
    /** 对齐 trips / 聚合 Trip 文档的 trip_id */
    trip_id?: string;
    user?: {
      user_id?: string;
      budget_cap?: number;
      risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    destination?: {
      destination_id?: string;
      name?: string;
      country_code?: string;
      city_code?: string;
    };
    flights?: Array<{
      flight_id?: string;
      flight_no?: string;
      /** IATA 等出发地代码（与 departure 二选一） */
      from?: string;
      to?: string;
      airline?: string;
      departure?: string;
      arrival?: string;
      departure_time?: string;
      arrival_time?: string;
      price?: number;
      currency?: string;
    }>;
    hotels?: Array<{
      hotel_id?: string;
      name?: string;
      check_in?: string;
      check_out?: string;
      nightly_price?: number;
      currency?: string;
      room_available?: boolean;
    }>;
    transportations?: Array<{
      mode: 'RAIL' | 'SUBWAY' | 'TAXI' | 'BIKE' | 'BUS' | 'WALK' | 'MIXED';
      provider?: string;
      eta_minutes?: number;
      cost_estimate?: number;
    }>;
    activities?: Array<{
      activity_id?: string;
      name?: string;
      type?: string;
      start_time?: string;
      end_time?: string;
      location?: string;
      price?: number;
    }>;
  };
}

/**
 * `GateResult.gate_result` 取值。必须遵循：Gate 在 Plan 之前执行（强顺序）。
 * 与对外 Verdict、Policy `action` 的映射见 `docs/decision/VERDICT_GATE_POLICY_MAPPING.md`。
 */
export type GateResultStatus = 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';

/**
 * Gate 层违规（Should-Exist / 三人格等）。分类以 `type` 为准，与 Item 上 `ItineraryRiskTag` 独立；
 * 展示层可做映射，见 `docs/decision/ADR-B1-RISK-TAG.md`。
 */
export interface GateViolation {
  type:
    | 'REACHABILITY'
    | 'SAFETY'
    | 'DEM'
    | 'DATA_MISSING'
    | 'TIME_CONFLICT'
    | 'FATIGUE'
    | 'BUDGET'
    | 'META_BUDGET'
    | 'HARNESS_GATE';
  severity: 'HARD' | 'SOFT';
  detail: string;
  evidence_refs?: string[]; // 关联的 EvidenceRef ID
}

export interface RequiredAdjustment {
  action:
    | 'CHANGE_MODE'
    | 'CHANGE_DATES'
    | 'SHORTEN_DAY'
    | 'REPLACE_SEGMENT'
    | 'REPLACE_POI'
    | 'ADD_BUFFER'
    | 'CHANGE_TRANSPORT'
    | 'REDUCE_SCOPE_OR_ADD_EVIDENCE';
  why: string;
  target?: string; // 调整目标（如 POI ID、路段 ID）
  alternatives?: string[]; // 替代方案
}

/**
 * NEED_USER_CONFIRM 时，准备度规则下单条问题（与 UserDecision / Gate 注入一致）
 */
export interface GateReadinessQuestionItem {
  id: string;
  /** 展示文案（与不同子系统兼容） */
  text?: string;
  prompt?: string;
}

/**
 * 按规则聚合的准备度问题（与 `ClaudeOrchestratorService.executeGateEvalStep` 注入一致）
 */
export interface GateReadinessRuleGroup {
  ruleId: string;
  questions: GateReadinessQuestionItem[];
  category?: string;
  severity?: string;
}

export interface GateResult {
  gate_result: GateResultStatus;
  violations: GateViolation[];
  required_adjustments: RequiredAdjustment[];
  confidence: number; // 0..1
  evidence_refs?: string[]; // 使用的证据引用
  /** NEED_USER_CONFIRM 时：准备度规则与问题列表 */
  readiness_questions?: GateReadinessRuleGroup[];
  guardian_results?: {
    abu?: {
      verdict: 'ALLOW' | 'REJECT';
      evidence: string[];
    };
    drdre?: {
      verdict: 'ALLOW' | 'ADJUST' | 'REJECT';
      evidence: string[];
    };
    neptune?: {
      verdict: 'ALLOW' | 'REPLACE' | 'REJECT';
      evidence: string[];
    };
  };
}

/**
 * EvidenceRef（证据引用）
 * 
 * 禁止编造事实，所有硬数据必须有证据
 * 
 * 注意：此接口已扩展以兼容 EvidenceEnvelope 格式（用于可解释性）
 */
export interface EvidenceRef {
  evidence_id: string;
  source: string; // skill_name / dataset（保留向后兼容）
  source_title?: string; // 证据来源标题（EvidenceEnvelope 兼容字段）
  source_url?: string; // 证据来源 URL（EvidenceEnvelope 兼容字段）
  publisher?: string; // 发布者（EvidenceEnvelope 兼容字段）
  published_at?: string; // 发布时间 ISO 8601（EvidenceEnvelope 兼容字段）
  retrieved_at?: string; // 检索时间 ISO 8601（EvidenceEnvelope 兼容字段，推荐使用此字段替代 last_verified_at）
  last_verified_at: string; // ISO 8601（保留向后兼容，建议迁移到 retrieved_at）
  data_timestamp?: string; // 数据本身的时间戳 ISO 8601（EvidenceEnvelope 兼容字段）
  excerpt?: string; // 短摘（EvidenceEnvelope 兼容字段）
  relevance?: number; // 相关性 0..1（EvidenceEnvelope 兼容字段）
  confidence: number; // 0..1
  related_decision_ids?: string[]; // 关联的决策 ID 列表（EvidenceEnvelope 兼容字段）
  url?: string; // 如可用（保留向后兼容，建议迁移到 source_url）
  data?: Record<string, any>; // 证据数据快照
}

/**
 * Itinerary（可执行行程）
 * 
 * 必须包含：时间窗 + 地点 + 可达性证据 +（必要时）开放时间/票务证据
 */
export type ItineraryItemType = 'TRANSIT' | 'DRIVE' | 'WALK' | 'POI' | 'REST' | 'MEAL' | 'ACCOMMODATION';

/**
 * 行程项上的结构化风险标签（B1，见 `docs/decision/ADR-B1-RISK-TAG.md`）。
 * 与 `metadata.risk_level` 正交：`risk_level` 表示严重度摘要，`risk_tags` 表示风险类别（可多选）。
 */
export type ItineraryRiskTag =
  | 'WEATHER'
  | 'CROWD'
  | 'HEALTH'
  | 'SAFETY'
  | 'COMPLIANCE'
  | 'LOGISTICS'
  | 'BUDGET'
  | 'DATA_QUALITY';

export interface ItineraryItem {
  id: string;
  type: ItineraryItemType;
  start_window: string; // ISO 8601 或 HH:mm
  end_window: string; // ISO 8601 或 HH:mm
  location_ref: {
    place_id?: string;
    name: string;
    coordinates?: { lat: number; lng: number };
    address?: string;
  };
  notes?: string;
  evidence_refs: string[]; // EvidenceRef ID 列表
  verified: boolean; // 是否已验证
  verification_status?: 'VERIFIED' | 'UNVERIFIED' | 'NEED_TOOL' | 'ASSUMPTION';
  metadata?: {
    duration_minutes?: number;
    cost?: number;
    opening_hours?: string;
    accessibility?: string;
    /** 严重度摘要（与 `risk_tags` 并存，见 ADR-B1） */
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    /** 可选：多维度风险标签，用于过滤/分析；不替代 Gate 侧 `GateViolation` */
    risk_tags?: ItineraryRiskTag[];
    distance_meters?: number; // 步行距离（米）
    /** 显式终点坐标；若缺省，Kernel `itineraryToRoutePlanDraft` 可用相邻 POI 链推断并打 `auto_filled_for_audit` */
    endLocation?: { lat: number; lng: number };
    transport_mode_changed?: boolean; // 交通方式是否已更改
    /** 专利实施例 2：航班号（REPLAN 替代航班） */
    flight?: string;
    /** 航班价格 */
    price?: number;
  };
}

export interface ItineraryDay {
  date: string; // ISO 8601 date
  items: ItineraryItem[];
}

export interface Itinerary {
  request_id: string;
  days: ItineraryDay[];
  metadata?: {
    total_days: number;
    total_cost_estimate?: number;
    robustness_score?: number; // 0..1
  };
  /**
   * Action 层执行计划（不代表已提交）
   * 由 preview/verify 阶段生成，commit 时才会外部落地。
   */
  action_plan?: Array<{
    action_id: string;
    action_type: TravelActionType;
    target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
    target_ref?: string;
    requires_confirmation: boolean;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    status?: 'PLANNED' | 'PENDING_CONFIRM' | 'COMMITTED' | 'FAILED' | 'ROLLED_BACK';
    evidence_refs?: string[];
  }>;
}

/**
 * DecisionLogEntry（决策日志）
 * 
 * 必须输出结构化决策日志：检查了什么、用了哪些证据、为什么允许/拒绝/调整
 */
export type OrchestrationStep = 
  | 'INTAKE'           // 解析用户需求 (Planner)
  | 'STATE_UPDATE'     // Phase 2.3: Kernel 状态同步 (DSO 更新)
  | 'RESEARCH'         // 收集硬数据 (Domain Agents)
  | 'POI_SELECTION'    // POI 选择与排序 (Planner)
  | 'GATE_EVAL'        // Should-Exist Gate (Gatekeeper/Abu)，含 CONSTRAINT_CHECK
  | 'CONTEXT_BUILD'    // Phase 2.3: 构建 Context Package (Kernel)
  | 'PLAN_GEN'         // 生成多方案 (Planner)
  | 'OPTIMIZE'         // Phase 2.3: 抽取 Optimization Hints (Kernel)
  | 'VERIFY'           // 验证可执行性 (CoreDecision/Dr.Dre)
  | 'COMPLIANCE'       // 风险合规检查 (Compliance)
  | 'REPAIR'           // 空间修复 (LocalInsight/Neptune)
  | 'NARRATE'          // 决策可视化 (Narrator)
  | 'FEEDBACK'         // RLHF信号采集 (Execution)
  | 'DONE'             // 完成
  | 'FAILED'           // 失败
  | 'TIMEOUT'          // 超时
  | 'HALLUCINATION_DETECTION'; // 幻觉检测

/**
 * 三人格类型（用于决策日志归因）
 */
export type GuardianType = 'ABU' | 'DR_DRE' | 'NEPTUNE';

export type SubAgentType = 'Orchestrator' | 'Planner' | 'Gatekeeper' | 'Compliance' | 'LocalInsight' | 'CoreDecision' | 'Narrator' | 'HallucinationDetection';

export interface DecisionLogEntry {
  request_id: string;
  step: OrchestrationStep;
  actor: SubAgentType;
  inputs_summary: string; // 输入摘要
  outputs_summary: string; // 输出摘要
  evidence_refs: string[]; // 使用的证据引用 ID
  timestamp: string; // ISO 8601
  /** C1 Strict: evidence bundle linkage (stable id) */
  evidence_bundle_id?: string;
  /** C1 Strict: hard rule fact refs used by this decision */
  hard_rule_fact_refs?: string[];
  metadata?: {
    duration_ms?: number;
    tool_calls?: number;
    cost_est_usd?: number;
    alternatives_considered?: number;
    guardian?: GuardianType; // 归因到三人格（P1 改进：ABU/DR_DRE/NEPTUNE）
    [key: string]: any; // 允许额外的元数据字段
  };
}

/**
 * 🆕 简化版解释（减少认知负荷）
 */
export interface SimplifiedExplanation {
  /** 决策摘要（一句话） */
  summary: string;
  
  /** 关键决策点（最多5个） */
  key_decisions: Array<{
    step: string;
    decision: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  
  /** 证据数量 */
  evidence_count: number;

  /** 可选：按频次聚合的风险标签（ADR-B1） */
  risk_tags_summary?: Array<{
    tag: ItineraryRiskTag;
    count: number;
  }>;
  
  /** 是否有详细版本 */
  has_details: boolean;
  
  /** 详细版本链接（前端可以按需加载） */
  details_url?: string;
}

/**
 * 🆕 AI能力展示（信任建立机制）
 */
export interface AICapabilityDisplay {
  /** 本次请求的成功状态 */
  success: boolean;
  
  /** 使用的AI能力 */
  capabilities_used: Array<{
    name: string;
    description: string;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  }>;
  
  /** 数据质量指标 */
  data_quality: {
    completeness: number; // 0-1，数据完整性
    freshness: number; // 0-1，数据新鲜度
    reliability: number; // 0-1，数据可靠性
  };
  
  /** 决策置信度 */
  confidence: {
    overall: number; // 0-1，整体置信度
    gate_evaluation: number; // 0-1，Gate评估置信度
    plan_generation: number; // 0-1，行程生成置信度
  };
  
  /** 局限性说明（提升信任） */
  limitations?: Array<{
    type: 'DATA_MISSING' | 'SERVICE_UNAVAILABLE' | 'UNCERTAINTY' | 'ASSUMPTION';
    description: string;
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
}

/**
 * PlanDiff（计划版本差异）
 * 
 * 用于记录版本之间的变更
 */
export interface PlanDiff {
  version_from: number;
  version_to: number;
  changes: Array<{
    type: 'ADD' | 'UPDATE' | 'DELETE';
    field: string;
    path: string; // JSON path（如 'itinerary.days[0].items[1]'）
    old_value?: any;
    new_value?: any;
    reason?: string;
  }>;
  timestamp: string;
}

/**
 * Orchestrator 状态（状态机）
 */
export interface OrchestratorState {
  request_id: string;

  /**
   * 对外四字结论（与 `GateResult` / Policy 的归约见 `docs/decision/VERDICT_GATE_POLICY_MAPPING.md`）。
   * 由 `deriveExternalVerdict`（`src/agent/utils/external-verdict.util.ts`）在 `route_and_run` 组装层写入。
   */
  verdict?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY' | 'ALLOW_WITH_FALLBACK';
  
  // === 版本化字段（P0 改进：支持版本追踪和回滚）===
  plan_id?: string; // 计划 ID（用于版本管理）
  plan_version?: number; // 计划版本号（每次更新递增）
  plan_diff?: PlanDiff; // 版本差异（REPAIR 步骤修改时生成）
  
  current_step: OrchestrationStep;
  trip_plan_request?: TripPlanRequest;
  gaps?: Array<{
    type:
      | 'MISSING_DESTINATION'
      | 'MISSING_DATES'
      | 'MISSING_CONSTRAINTS'
      | 'MISSING_PREFERENCES'
      | 'SPEC_TYPE_ERROR'
      | 'INTENT_COMPILE_ERROR';
    severity: 'HARD' | 'SOFT';
    detail: string;
  }>;
  clarification_questions?: ClarificationQuestion[]; // 结构化澄清问题（P1 改进）
  research_data?: Record<string, any>; // Skills 返回的硬数据
  gate_result?: GateResult;
  compliance_result?: {
    risk_warnings: Array<{
      level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
      message: string;
      requires_user_confirmation: boolean;
    }>;
    disclaimers: string[];
    required_confirmations: string[];
  }; // Compliance 检查结果
  itinerary?: Itinerary;
  alternatives?: {
    alternative_pois: Array<{
      poi_id: string;
      name: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
    alternative_routes: Array<{
      route_id: string;
      description: string;
      reason: string;
      evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
      evidence_refs?: string[];
    }>;
  };
  narration?: {
    user_friendly_summary: string;
    day_by_day_narrative: Array<{
      day: number;
      date: string;
      narrative: string;
    }>;
    highlights: string[];
    tips: string[];
    warnings?: NarrationWarningEntry[];
  };
  evidence_registry: Map<string, EvidenceRef>; // evidence_id -> EvidenceRef
  decision_log: DecisionLogEntry[];
  decision_steps?: any[]; // Decision Steps（业务层决策，来自 Decision-First Engine）
  errors: Array<{
    step: OrchestrationStep;
    error_code: string;
    message: string;
    timestamp: string;
  }>;
  metadata: {
    started_at: string;
    last_updated_at: string;
    total_duration_ms?: number;
    warnings?: Array<{
      type: string;
      message: string;
      items?: any[];
    }>;
    [key: string]: any;
  };
  /**
   * Action 执行域状态（用于 action preview/commit/rollback 全链路追踪）
   */
  action_execution?: {
    mode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO';
    status?: 'NOT_STARTED' | 'PENDING_CONFIRM' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'ROLLED_BACK';
    pending_actions?: Array<{
      action_id: string;
      action_type: TravelActionType;
      target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      requires_confirmation: boolean;
    }>;
    last_error?: {
      code: string;
      message: string;
      retryable?: boolean;
      provider?: string;
    };
  };
}

/**
 * JEPA（潜在空间协议）产品化数据结构
 *
 * 约束：
 * - latent 值必须是可标准化的“特征向量”（0..1 标准化；缺失用 null）
 * - predictor 输出（z_pred/z_real/delta/prediction_errors）可选：当系统尚未实现局部模拟器时允许为空
 */
export type Normalized01 = number | null;

export interface LatentContractEnvVector {
  // terrain_risk: [slope, road_condition, road_width]
  terrain_risk: [Normalized01, Normalized01, Normalized01];
  // weather_state: [wind_speed, visibility, precipitation]
  weather_state: [Normalized01, Normalized01, Normalized01];
  // accessibility: [rescue_distance, signal_coverage]
  accessibility: [Normalized01, Normalized01];
  // temporal_factor: [daylight_hours, night_risk]
  temporal_factor: [Normalized01, Normalized01];
  missing_fields: string[];
  fill_strategy: 'NULL';
}

export interface LatentContractUserVector {
  // z_user = 效用曲面梯度敏感度
  risk_tolerance: Normalized01;
  delay_sensitivity: Normalized01;
  fatigue_limit: Normalized01;
  experience_level: Normalized01;
  missing_fields: string[];
  fill_strategy: 'NULL';
}

export interface LatentContractStateVector {
  continuity: Normalized01;
  risk_score: Normalized01;
  cost: Normalized01;
  fatigue: Normalized01;
  satisfaction_estimate: Normalized01;
  missing_fields: string[];
  fill_strategy: 'NULL';
}

export interface LatentContract {
  z_env: LatentContractEnvVector;
  z_user: LatentContractUserVector;
  z_state: LatentContractStateVector;
}

export interface JepaMultiHeadPredictorOutputs {
  // 所有 head 输出均建议使用概率/分布（这里先保留可扩展结构）
  risk_head?: {
    risk_increase_prob?: number | null;
  };
  continuity_head?: {
    continuity_break_prob?: number | null;
  };
  fatigue_head?: {
    fatigue_increase_prob?: number | null;
  };
  cost_head?: {
    cost_overrun_prob?: number | null;
  };
}

export interface PredictionErrorWorld {
  magnitude?: number | null;
  details?: string[];
}

export interface PredictionErrorUserDrift {
  magnitude?: number | null;
  details?: string[];
}

export interface PredictionErrorUtility {
  magnitude?: number | null;
  details?: string[];
}

export interface PredictionErrors {
  // World Error / User Drift / Utility Error（核心训练信号）
  world_error?: PredictionErrorWorld;
  user_drift?: PredictionErrorUserDrift;
  utility_error?: PredictionErrorUtility;
}

export interface DecisionTraceJepa {
  // 当 predictor 尚未实现局部模拟器时允许为空
  z_pred?: LatentContractStateVector | undefined;
  z_real?: LatentContractStateVector | undefined;
  delta?: Partial<Record<keyof LatentContractStateVector, number | null>> | undefined;
  // 可选：方便 UI 回放“状态变化”
  at?: string;
}

export interface RiskTrajectoryPoint {
  at: string;
  risk_score: number | null;
  // 可选：便于 UI 展示“为什么风险上升”（来自 Explain Layer）
  reason?: string;
}

export interface JepaArbitrationSummary {
  selected_candidate_id?: string;
  rejected_count?: number;
  conflict_detected?: boolean;
  fallback_used?: boolean;
}

export interface JepaPayload {
  version: '1.0';
  latent_contract: LatentContract;
  predictor_outputs?: JepaMultiHeadPredictorOutputs | undefined;
  decision_trace?: DecisionTraceJepa | undefined;
  prediction_errors?: PredictionErrors | undefined;
  risk_trajectory?: RiskTrajectoryPoint[] | undefined;
  /**
   * 可选：本轮为何触发推理增强（如 WEATHER_SPIKE / CONSTRAINT_CONFLICT）
   */
  trigger_reasons?: string[] | undefined;
  /**
   * 可选：Kernel 仲裁结果摘要（对外最小暴露）
   */
  arbitration?: JepaArbitrationSummary | undefined;
}
