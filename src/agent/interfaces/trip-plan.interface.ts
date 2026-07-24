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
import type {
  NarrationWarningEntry,
  NarrationResearchUiHint,
  NarrationVoiceToneModifier,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import type { ResearchConflictNegotiationReport } from '../teams/research/research-conflict-negotiation.types';

/**
 * 与门控 / 研究证据同源的辩论注入 SKU（冰岛 F-road、阵风等）；不得写入未验证事实。
 * 由编排或研究层写入 `TripPlanRequest.guardian_debate_trip_context`，与 `violations` 对齐。
 */
export interface GuardianDebateRoadStatusEntry {
  id: string;
  status: string;
  reason?: string;
  source?: string;
}

export interface GuardianDebateFerryStatusEntry {
  route: string;
  status: string;
  reason?: string;
  next_available?: string;
}

export interface GuardianDebateTripContextSku {
  location?: string;
  timestamp?: string;
  environment?: {
    road_status?: GuardianDebateRoadStatusEntry[];
    weather_snapshot?: {
      wind_speed_ms?: number;
      wind_gust_ms?: number;
      condition?: string;
      visibility_m?: number;
      is_extreme?: boolean;
    };
    /** 挪威渡轮等：与 Entur/业务日历同源注入 */
    ferry_status?: GuardianDebateFerryStatusEntry[];
    /** SafeTravel / 合规摘要：轻量引用，避免把整条 RSS 塞进辩论 */
    route_alert_refs?: Array<{ id?: string; title?: string; severity?: string }>;
    /** F 路 / 高地穿越意图（INTAKE 信号写入） */
    froad_crossing?: boolean;
    primary_froad?: string;
    season_note_zh?: string;
  };
  /** 与 `TripPlanRequest.constraints`（车辆/预算）区分：日程、日光、驾驶上限等 */
  scheduling_constraints?: {
    /** 民用暮光终前后沿 IANA 时区换算的 UTC ISO8601，供 Dr.Dre 引用「日光窗」 */
    daylight_end?: string;
    /** 自动写入时标明来源，便于审计（显式 SKU 可省略） */
    daylight_end_source?: 'suncalc_civil_dusk_v1';
    driving_limit_strict?: boolean;
    /** 极昼马拉松：跨越日历边界的连续驾驶逻辑窗（小时），与 `days` 日历字段解耦 */
    logical_continuous_window_hours?: number;
    /** 用户选择「向导模式」后继续规划 */
    guide_mode_requested?: boolean;
    /** 极昼错峰观鲸场次（用户确认后写入） */
    whale_watching_slot?: {
      date?: string;
      start_local: string;
      end_local: string;
      venue_zh?: string;
      slot_label_zh?: string;
    };
    /** 次日最早出发本地时间 HH:mm */
    next_day_delayed_departure_until?: string;
    /** 活动结束后当日仍有驾驶（如胡萨维克→阿克雷里） */
    overnight_drive_after_activity?: boolean;
    /** 用户已确认锁定极昼晚间观鲸场次 */
    midnight_sun_slot_locked?: boolean;
    /** Layer1：用户选定将活动插入的行程日 */
    itinerary_slot_placement?: {
      day_number?: number;
      date_ymd?: string;
    };
    /** 用户已确认按行程日历天数分段环岛（放弃 24h 一口气跑完） */
    segmented_ring_over_calendar_days?: boolean;
  };
  /** 用户对 guardian_debate_abu_reject_v1 的选择（澄清闭环） */
  debate_user_confirm?: {
    question_id: 'guardian_debate_abu_reject_v1';
    choice: string;
    confirmed_at?: string;
  };
  route_alternatives?: Array<{
    id: string;
    type?: string;
    extra_driving_time_mins?: number;
  }>;
  poi_metadata?: {
    transport?: Record<string, unknown>;
    candidates?: Array<Record<string, unknown>>;
  };
  /** 从用户原话解析的不可静默覆盖的诉求锚点（见 guardian-debate-user-intent-anchor.util） */
  user_intent_anchors?: {
    midnight_sun_continuous_drive?: boolean;
    ring_road_full_scope?: boolean;
    f_road_highland_crossing?: boolean;
    primary_froad?: string;
    destination_highland_zh?: string;
    melt_season_risk_zh?: string;
    peak_season_crowd_avoidance?: boolean;
    whale_watching_husavik?: boolean;
    overnight_stay_akureyri?: boolean;
    interpretation_zh?: string;
    disambiguation_zh?: string;
    /** 用户确认接受分段环岛（非 24h 一口气） */
    user_accepted_segmented_ring?: boolean;
  };
}

/**
 * Entur 轮渡等服务快照（写入 `research_data.transport_snapshots.entur`），由 enricher 映射为 `guardian_debate_trip_context.environment.ferry_status`。
 */
export interface EnturFerrySnapshot {
  service_id: string;
  status: 'OPERATIONAL' | 'CANCELLED' | 'DELAYED' | 'UNKNOWN';
  next_departure?: string;
  disruptions?: string[];
  source: 'Entur';
}

/**
 * 研究层交通快照容器（扩展字段可继续增加，如 `gtfs_rt`）。
 */
export interface ResearchTransportSnapshots {
  entur?: EnturFerrySnapshot[];
}

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
  /** 绑定 Trips 库行程时，itinerary.generate 等可读取 TripDay/ItineraryItem 作为槽位与 POI 来源 */
  trip_id?: string;
  /**
   * 可选：编排器注入的治理追踪 ID，用于 Governance Ledger 将多跳因果与单次 orchestration 关联。
   */
  governance_trace?: {
    correlation_id?: string;
    causality_chain_id?: string;
  };
  /** GRSM posture (orchestration hydrate); incremental / planner recovery strategies. */
  governance_runtime_state?: import('../../governance/runtime-state-machine/governance-runtime-state.types').GovernanceRuntimeState;
  /** GFIL: gated drift influence vectors (orchestration; no ledger). */
  governance_drift_influences?: import('../../governance/feedback/governance-drift-influence.types').GovernanceDriftInfluence[];
  /** System 1 / NL 侧人格倾向（不在快路径执行三人格；供 System 2 门控与编排作评估基准） */
  persona_hint?: {
    abu_strictness?: 'NORMAL' | 'CRITICAL';
    drdre_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    neptune_creativity?: 'CONSERVATIVE' | 'BALANCED' | 'EXPLORATORY';
  };
  /**
   * 结构化环境与交通切片；与门控 violations 同源，合并进辩论 User JSON 的 `trip_context`。
   * 见 `prompts/agents/guardians-debate.md`（冰岛 SKU 示例）。
   */
  guardian_debate_trip_context?: GuardianDebateTripContextSku;
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
  /** route_and_run 显式提交：行动能力/体能补充（中文；不入 L1 DB，供 VERIFY/体验评估等读取） */
  party_mobility_note_zh?: string;
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
  /** PLAN_GEN 后由编排器从 itinerary 汇总的驾驶实数（公理 / VERIFY 热路径）。 */
  plan_output?: import('../axioms/plan-routing-metrics.types').PlanGenerationRoutingOutput;
  routing_metadata?: import('../axioms/plan-routing-metrics.types').PlanGenerationRoutingOutput;
  routing_metrics?: {
    pure_driving_minutes?: number;
    /** @deprecated 使用 pure_driving_minutes */
    total_driving_minutes?: number;
    max_single_day_driving_minutes?: number;
    day_segments?: import('../axioms/plan-routing-metrics.types').PlanRoutingDaySegment[];
  };
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
  /** INTAKE `trip.load`：已从 DB Hydrate 的行程项 */
  persisted_itinerary_items?: unknown[];
  /** INTAKE `trip.load` 元信息 */
  trip_load?: {
    tripId: string;
    itemCount: number;
    degraded?: boolean;
    degradedReason?: string;
    loadedAt: string;
  };
}

/**
 * 三人格证据原子（供前端按 violation_code / tag 做高亮与图标，不全依赖纯文本）。
 */
export interface GuardianEvidenceAtom {
  text: string;
  /** 稳定机器码，如 GATE_VIOLATION:SAFETY:HARD、ADJUSTMENT:REPLACE_SEGMENT */
  violation_code?: string;
  /** UI 语义标签 */
  tag?:
    | 'safety'
    | 'reachability'
    | 'dem'
    | 'fatigue'
    | 'pacing'
    | 'replace_segment'
    | 'scope'
    | 'adjustment'
    | 'generic';
}

/** 规则投影（当前默认）| 辩论引擎等多模型输出（预留） */
export type GuardianResultsSource = 'violation_projection_v1' | 'llm_debate' | string;

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
  /** BFF 出站：中文标题（替代前端直显 ROUTE_INFEASIBLE 等英码） */
  display_headline_zh?: string;
  evidence_refs?: string[]; // 关联的 EvidenceRef ID
  /**
   * 若为 true：由 VERIFY 阶段合成并入 `gate_result`（见 `mergeVerificationIssuesIntoGateResult`）。
   * 仍参与 `deriveGuardianPersonaVotes`（如 HARD → Abu REJECT），但不触发辩论 LLM 的「致命门短路」（见 `GuardiansDebateService.hasFatalViolation`）。
   */
  verify_synthetic?: boolean;
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
  /** ADD_BUFFER：与 verify 的 TIME_WINDOW_OVERLAP.related_item_id 对齐，用该行程项的 end 作锚（非序列紧邻重叠时必需） */
  buffer_anchor_item_id?: string;
  /** ADD_BUFFER：多前项对同一后项重叠时由 map 合并；repair 取 max(各锚 end)+buffer。若与 buffer_anchor_item_id 同时存在，以本数组为准 */
  buffer_anchor_item_ids?: string[];
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

import type { PersonaClosureAudit } from '../../trips/decision/shared/persona-closure.types';

export interface GateResult {
  gate_result: GateResultStatus;
  violations: GateViolation[];
  required_adjustments: RequiredAdjustment[];
  confidence: number; // 0..1
  evidence_refs?: string[]; // 使用的证据引用
  /** StrategyOrchestrator persona closure 闭环审计（Neptune REPLACE 后 Abu 重验） */
  persona_closure_audit?: PersonaClosureAudit;
  /** NEED_USER_CONFIRM 时：准备度规则与问题列表 */
  readiness_questions?: GateReadinessRuleGroup[];
  /**
   * 三人格侧写。`source` + `is_simulated` 用于审计：区分 violations 规则投影与未来 LLM 辩论输出。
   * 各子项 `evidence` 为兼容单列摘要；`evidence_atoms` 为结构化原子证据。
   */
  guardian_results?: {
    source?: GuardianResultsSource;
    /** true：由 violations / adjustments 规则投影生成 */
    is_simulated?: boolean;
    /** 影子辩论 LLM 一句合议摘要（可选） */
    debate_summary_zh?: string;
    /** 辩论引擎单次调用耗时（毫秒，可选） */
    debate_latency_ms?: number;
    /** Assembler `await` shadow 的等待时长（毫秒）；与 `debate_latency_ms` 对照可估算重叠收益 */
    debate_shadow_wait_ms?: number;
    /** max(0, debate_latency_ms - debate_shadow_wait_ms)，粗算「若晚启动辩论会多等的墙钟」 */
    debate_overlapping_latency_saved_estimate_ms?: number;
    /** `Date.now()`（ms），编排器 `startShadowIfEligible` 触发时刻 */
    debate_shadow_triggered_at?: number;
    abu?: {
      verdict: 'ALLOW' | 'REJECT';
      evidence: string[];
      evidence_atoms?: GuardianEvidenceAtom[];
    };
    drdre?: {
      verdict: 'ALLOW' | 'ADJUST' | 'REJECT';
      evidence: string[];
      evidence_atoms?: GuardianEvidenceAtom[];
    };
    neptune?: {
      verdict: 'ALLOW' | 'REPLACE' | 'REJECT';
      evidence: string[];
      evidence_atoms?: GuardianEvidenceAtom[];
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
  /**
   * 执行控制面（policy.resolve → itinerary.generate），与展示用 `metadata` 分离。
   * 例如：单段驾驶时长上限由策略裁决写入，勿再用 metadata 传播同类语义。
   */
  governance?: {
    max_drive_leg_hours?: number;
  };
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
    /** itinerary.generate / 增量骨架：当日 POI 来自研究排期还是启发式 */
    slot_source?: 'research_schedule' | 'heuristic' | string;
    /** 同上：时间窗来自 POI 字段、开放时间证据或默认启发式 */
    time_source?: 'poi_evidence' | 'opening_hours_evidence' | 'heuristic' | string;
    /** 分段规划：REST「待安排」占位原因（审计 / 工作台） */
    placeholder_reason?: string;
    /** 工作台二次 `poi.search` 建议检索串（只读提示） */
    suggested_poi_search_queries?: string[];
    /**
     * 路段标识（如 `ring-road:vik-jokulsarlon`），与 `research_data.safetravel_alerts[].affected_route_segment_refs` 对齐；
     * 用于 SafeTravel / 封路类 REACHABILITY 校验（Case 5 Lifeline）。
     */
    route_segment_ref?: string;
    /** 写入 `route_segment_ref` 的打标器版本（审计 / replay），如 `corridor_v1` */
    segment_tagger?: string;
    /**
     * Verify V2 只读：SafeTravel `affected_route_segment_refs` 与 `route_segment_ref` 对齐时的拓扑锚点（不删项）。
     * 每轮 verify 会先清空再按当前 alerts 重算，避免陈旧标记。
     */
    closure_shadow?: {
      cut_point?: boolean;
      route_segment_ref?: string;
      alert_severity?: 'CRITICAL' | 'ERROR' | 'WARNING';
      alert_ids?: string[];
    };
    /** CTRE Graph 投影：canonical poiId */
    canonical_poi_id?: string;
    intent_tags?: string[];
    /** CTRE Graph 节点溯源 */
    graph_node_kind?: string;
    graph_node_id?: string;
    booking_kind?: string;
    booking_status?: string;
    linked_node_id?: string;
    linked_poi_node_id?: string;
    activity_type?: string;
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
    /** verify 旁路只读快照（避免 itinerary 合同依赖 skills 具体类型） */
    verify_shadow?: Record<string, unknown>;
    /** CTRE Graph 投影来源 */
    source?: string;
    graphId?: string;
    compileId?: string;
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
  | 'INTENT_COMPILE'   // Decision OS：自然语言 → PlanDeltaIR
  | 'INTAKE'           // 解析用户需求 (Planner)
  | 'STATE_UPDATE'     // Phase 2.3: Kernel 状态同步 (DSO 更新)
  | 'RESEARCH'         // 收集硬数据 (Domain Agents)
  | 'POI_SELECTION'    // POI 选择与排序 (Planner)
  | 'GATE_EVAL'        // Should-Exist Gate (Gatekeeper/Abu)，含 CONSTRAINT_CHECK
  | 'CONTEXT_BUILD'    // Phase 2.3: 构建 Context Package (Kernel)
  | 'PLAN_GEN'         // 生成多方案 (Planner)
  | 'TRAVEL_COMPILE'   // Planner Draft → CanonicalTravelGraph（Travel Compiler）
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

export type SubAgentType =
  | 'Orchestrator'
  | 'Planner'
  | 'Gatekeeper'
  | 'Compliance'
  | 'LocalInsight'
  | 'CoreDecision'
  | 'Narrator'
  | 'HallucinationDetection'
  | 'DecisionOS.IntentCompiler';

export interface DecisionLogEntry {
  request_id: string;
  step: OrchestrationStep;
  actor: SubAgentType;
  inputs_summary: string; // 输入摘要
  outputs_summary: string; // 输出摘要
  evidence_refs: string[]; // 使用的证据引用 ID
  timestamp: string; // ISO 8601
  /**
   * 依据说明（本体 / 路况）：中文短句；与 `evidence_refs` 中 `ontology_*` 机器串配套。
   * 决策日志 UI 应主区展示本字段，技术标识符折叠或悬停。
   */
  ontology_evidence_display_zh?: string[];
  /** 准备度中文说明；`readiness_pack_check:` 见 `readiness_technical_evidence_refs`。 */
  readiness_evidence_display_zh?: string[];
  readiness_technical_evidence_refs?: string[];
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
    /** MAT 3.0 NARRATE：`ResearchConflictNegotiationReport.primary_narrative_stance` */
    ebp_stance?: string;
    /** MAT 3.0 NARRATE：合并 manifest 后最终生效的 `NarrationLike.voice_tone_modifier` */
    effective_voice_tone?: string | null;
    /** MAT 6.1 NARRATE：STITCH 叙事坍缩策略（与 `ResearchConflictNegotiationReport.stitch_tactic` 对齐） */
    stitch_tactic?: 'TRANSPARENT_SEGMENTED' | 'AGGRESSIVE_COMPENSATION';
    /** MAT 6.2 NARRATE：manifest 中非合规 STALE_RECOVERED 域经实体坍缩合并的数量 */
    collapsed_suture_count?: number;
    /** MAT 6.3 NARRATE：`research_data.__research_realtime_reroll_count` 快照（预算仲裁等成功重跑次数） */
    realtime_reroll_count?: number;
    /**
     * HALLUCINATION_DETECTION：`formatHallucinationOutputsZh` 的结构化补充（抽查样例、计数、可选 user_notification 摘要）。
     * 与 `outputs_summary` 同源；统一入口可只展示 headline，展开后读此对象。
     */
    hallucination_audit_zh?: {
      total_claims: number;
      verified_against_evidence: number;
      risk_marked: number;
      removed_or_softened: number;
      sample_rows: Array<{ excerpt_zh: string; outcome_zh: string }>;
      user_notification?: { message: string | null; low_confidence_count: number };
    };
    /**
     * CRUD 短路：实际执行的 Skill 名列表（如 trip.applyEdit），供决策日志与 UI 展示。
     */
    skills_hit?: string[];
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
  /** Skills 返回的硬数据；可含 `__research_asset_manifest`（2.0 研究资产作用域版本/无效化审计） */
  research_data?: Record<string, any>;
  /**
   * MAT 3.0+：由 NarrateExecutor 从 `NarrateExecutorContext.researchConflict` 注入，供 Narrator 读取 EBP 协商结果
   *（避免在叙述层解析 `research_data.__research_conflict_negotiation`）。
   */
  narration_research_conflict?: ResearchConflictNegotiationReport;
  /** P0：NARRATE 前 EmotionNarratorOrchestrator 只读投影（tripnara.emotional_context@v1） */
  emotional_context?: import('../narrator/types/emotional-context.type').EmotionalContext;
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
    /** 与 NARRATE `day_by_day_text_zh` 对齐：纯文本逐日块，供卡片区直出 */
    day_by_day_text_zh?: string;
    highlights: string[];
    tips: string[];
    warnings?: NarrationWarningEntry[];
    research_ui_hints?: NarrationResearchUiHint[];
    voice_tone_modifier?: NarrationVoiceToneModifier;
    /** BFF：EBP / 冲突协商后的视觉层建议 */
    visual_hint?: string;
    /** BFF：语音韵律 / TTS 参数建议 */
    audio_prosody?: string;
    /** unified-explainability@v1（NARRATE 写入；assembler explain.unified 优先复用） */
    unified_explainability?: import('../../trips/decision/explainability/unified-explainability.types').UnifiedExplainabilityEnvelopeV1;
    /** 客户端 payload：envelope 仅在 explain.unified；narration 侧为引用 */
    unified_explainability_ref?: import('../../trips/decision/explainability/dedupe-unified-explainability-client-payload.util').UnifiedExplainabilityClientRef;
    guardian_narrative_zh?: {
      abu: string;
      drdre: string;
      neptune: string;
    };
    risk_highlights?: Array<{
      risk: string;
      severity: 'high' | 'medium' | 'low';
      explanation: string;
      reason_codes?: string[];
      evidence_refs?: string[];
    }>;
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
    /** route_and_run 冻结的 travelPreference 快照（含 request_fitness_* 等），供 Assembler / 观测解释 */
    travel_preference_snapshot?: Record<string, unknown>;
    /** Gate 落定且 `enable_guardians_debate_llm` 时触发辩论 shadow 的单调时间戳（ms），供重叠延迟审计 */
    debate_triggered_at?: number;
    /** 是否已发起辩论 LLM shadow（与 `GuardiansDebateService.startShadowIfEligible` 对齐） */
    debate_shadow_started?: boolean;
    /** PLAN_GEN 前已 await 辩论并可能将 Abu REJECT 融合为 NEED_USER_CONFIRM（Assembler 勿重复 LLM） */
    debate_merged_before_plan_gen?: boolean;
    /** `fuseGuardianDebateVerdictIntoGate` 原因，如 `abu_reject` */
    debate_gate_fusion?: string;
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
