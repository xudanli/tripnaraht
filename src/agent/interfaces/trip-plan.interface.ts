// src/agent/interfaces/trip-plan.interface.ts

/**
 * TripNARA 统一数据合同（基于 claude.md）
 * 
 * 遵循决策优先（Decision-first）原则：
 * - Should-Exist Gate → 可执行行程（Executable Itinerary）→ 决策日志（Decision Log）
 */

import { ClarificationQuestion } from './clarification.interface';

/**
 * TripPlanRequest（最小字段）
 */
export interface TripPlanRequest {
  request_id: string; // 必填
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
  constraints?: {
    budget?: {
      total?: number;
      currency?: string;
    };
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
}

/**
 * GateResult（门控结果）
 * 
 * 必须遵循：Gate 在 Plan 之前执行（强顺序）
 */
export type GateResultStatus = 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';

export interface GateViolation {
  type: 'REACHABILITY' | 'SAFETY' | 'DEM' | 'DATA_MISSING' | 'TIME_CONFLICT' | 'FATIGUE' | 'BUDGET';
  severity: 'HARD' | 'SOFT';
  detail: string;
  evidence_refs?: string[]; // 关联的 EvidenceRef ID
}

export interface RequiredAdjustment {
  action: 'CHANGE_MODE' | 'CHANGE_DATES' | 'SHORTEN_DAY' | 'REPLACE_SEGMENT' | 'REPLACE_POI' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT';
  why: string;
  target?: string; // 调整目标（如 POI ID、路段 ID）
  alternatives?: string[]; // 替代方案
}

export interface GateResult {
  gate_result: GateResultStatus;
  violations: GateViolation[];
  required_adjustments: RequiredAdjustment[];
  confidence: number; // 0..1
  evidence_refs?: string[]; // 使用的证据引用
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
    risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    distance_meters?: number; // 步行距离（米）
    transport_mode_changed?: boolean; // 交通方式是否已更改
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
}

/**
 * DecisionLogEntry（决策日志）
 * 
 * 必须输出结构化决策日志：检查了什么、用了哪些证据、为什么允许/拒绝/调整
 */
export type OrchestrationStep = 'INTAKE' | 'RESEARCH' | 'GATE_EVAL' | 'PLAN_GEN' | 'VERIFY' | 'REPAIR' | 'NARRATE' | 'DONE' | 'FAILED' | 'HALLUCINATION_DETECTION';

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
  
  // === 版本化字段（P0 改进：支持版本追踪和回滚）===
  plan_id?: string; // 计划 ID（用于版本管理）
  plan_version?: number; // 计划版本号（每次更新递增）
  plan_diff?: PlanDiff; // 版本差异（REPAIR 步骤修改时生成）
  
  current_step: OrchestrationStep;
  trip_plan_request?: TripPlanRequest;
  gaps?: Array<{
    type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
    severity: 'HARD' | 'SOFT';
    detail: string;
  }>;
  clarification_questions?: ClarificationQuestion[]; // 结构化澄清问题（P1 改进）
  research_data?: Record<string, any>; // Skills 返回的硬数据
  gate_result?: GateResult;
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
    warnings?: string[];
  };
  evidence_registry: Map<string, EvidenceRef>; // evidence_id -> EvidenceRef
  decision_log: DecisionLogEntry[];
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
}
