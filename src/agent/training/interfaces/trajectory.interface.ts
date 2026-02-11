// src/agent/training/interfaces/trajectory.interface.ts

import { GateResult, Itinerary, DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import { ApprovalStatus } from '@prisma/client';

/**
 * ComplianceResult（合规检查结果）
 */
export interface ComplianceResult {
  risk_warnings: Array<{
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
    message: string;
    requires_user_confirmation: boolean;
  }>;
  disclaimers: string[];
  required_confirmations: string[];
}

/**
 * ExecutionResult（执行结果）
 */
export interface ExecutionResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 轨迹验证结果
 */
export interface TrajectoryValidationResult {
  isValid: boolean;
  score: number; // 0..1
  reasons: string[];
}

/**
 * Reward 信号类型
 */
export type RewardSignalType =
  | 'USER_APPROVAL'       // 用户审批
  | 'PLAN_COMMIT'         // 规划提交
  | 'DECISION_ALIGNMENT'  // 决策对齐
  | 'EXECUTION_SUCCESS'   // 执行成功
  | 'EXECUTION_FAILURE'   // 执行失败
  // TripNARA v2.0 新增
  | 'GATE_PASS'           // 门控通过
  | 'GATE_FAIL'           // 门控失败
  | 'SAFETY_PASS'         // 安全通过
  | 'COMPLIANCE_PASS'     // 合规通过
  | 'FEASIBILITY_PASS'    // 可执行通过
  | 'EVIDENCE_QUALITY'    // 证据质量
  | 'RISK_DISCLOSURE'     // 风险披露
  | 'PREFERENCE_BONUS'    // 偏好加分
  // POI 相关信号
  | 'CORE_POI_SKIPPED'    // 核心 POI 被跳过
  | 'POI_ADDED';          // POI 被添加

/**
 * Reward信号
 */
export interface RewardSignal {
  type: RewardSignalType;
  value: number; // reward值
  timestamp: string; // ISO 8601
  metadata?: Record<string, any>;
}

/**
 * 轨迹收集数据
 */
export interface TrajectoryCollectionData {
  requestId: string;
  tripId?: string;
  plan: Itinerary;
  decisionTrace: DecisionLogEntry[];
  researchData: Record<string, any>;
  gateResult: GateResult;
  complianceResult: ComplianceResult;
  modelVersion?: string;
  countryCode?: string;
}

/**
 * 轨迹更新数据（用于更新已有轨迹）
 */
export interface TrajectoryUpdateData {
  userApproval?: ApprovalStatus;
  executionResult?: ExecutionResult;
}

/**
 * RL轨迹格式（s,a,r,s'）
 * 
 * 用于强化学习训练的标准化轨迹格式
 * 
 * TripNARA v2.0: 增加风险层特征、证据引用、不确定性标记
 */

// ============================================================================
// TripNARA 风险层特征 (Risk Layers)
// ============================================================================

/**
 * 天气风险特征
 */
export interface WeatherRisk {
  current_conditions: string;        // 当前天气描述
  forecast_window: string;           // 预报时间窗口
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  blocking_events?: string[];        // 阻断性天气事件
  temperature_range?: { min: number; max: number };
  precipitation_probability?: number;
  wind_speed_kmh?: number;
}

/**
 * 道路通行状态
 */
export interface RoadConditions {
  /** F-Road 状态映射 (road_id -> status) */
  f_road_status: Record<string, 'OPEN' | 'CLOSED' | 'RESTRICTED' | 'UNKNOWN'>;
  closure_reasons?: string[];
  seasonal_restrictions?: string[];
  river_crossing_status?: 'SAFE' | 'CAUTION' | 'DANGEROUS' | 'IMPASSABLE';
  last_updated?: string;
}

/**
 * 地形特征
 */
export interface TerrainFeatures {
  max_elevation_m: number;
  min_elevation_m?: number;
  elevation_gain_m: number;
  river_crossings: number;
  technical_difficulty: 'EASY' | 'MODERATE' | 'DIFFICULT' | 'EXTREME';
  surface_type?: 'PAVED' | 'GRAVEL' | 'DIRT' | 'ROCKY' | 'MIXED';
  gradient_max_percent?: number;
}

/**
 * 时间窗口特征
 */
export interface TemporalFeatures {
  daylight_hours: number;
  golden_hour_windows?: string[];    // e.g., ["06:00-07:30", "20:00-21:30"]
  seasonal_context: string;          // e.g., "mid-summer", "polar-night"
  aurora_probability?: number;       // 极光概率 0-1
  midnight_sun?: boolean;
}

/**
 * 救援可达性（安全网）
 */
export interface SafetyNet {
  nearest_hospital_km: number;
  nearest_gas_station_km?: number;
  cell_coverage_percent: number;     // 0-100
  rescue_response_time_min: number;
  emergency_shelter_available?: boolean;
  satellite_phone_required?: boolean;
}

/**
 * 风险层摘要
 */
export interface RiskSummary {
  weather: WeatherRisk;
  road_conditions: RoadConditions;
  terrain: TerrainFeatures;
  temporal: TemporalFeatures;
  safety_net: SafetyNet;
  /** 综合风险等级 */
  overall_risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** 风险摘要文本 */
  risk_narrative?: string;
}

// ============================================================================
// TripNARA 证据系统 (Evidence)
// ============================================================================

/**
 * 证据来源类型
 */
export type EvidenceSource = 
  | 'KNOWLEDGE_BASE'    // 知识库
  | 'REAL_TIME_API'     // 实时 API
  | 'USER_INPUT'        // 用户输入
  | 'HISTORICAL_DATA'   // 历史数据
  | 'EXTERNAL_SYSTEM';  // 外部系统

/**
 * 证据新鲜度
 */
export type EvidenceFreshness = 'FRESH' | 'STALE' | 'EXPIRED';

/**
 * 证据引用
 */
export interface EvidenceRef {
  evidence_id: string;
  source: EvidenceSource;
  source_name: string;               // e.g., 'iceland-f-road-status-api'
  timestamp: string;                 // 数据时间戳 ISO 8601
  freshness: EvidenceFreshness;
  freshness_ttl_hours?: number;      // 新鲜度 TTL
  credibility_score: number;         // 0-1
  content_summary: string;           // 证据摘要
  supports_decision?: string;        // 支撑哪个决策点
  raw_data?: Record<string, any>;    // 原始数据（可选）
}

// ============================================================================
// TripNARA 不确定性标记 (Uncertainty)
// ============================================================================

/**
 * 置信度等级
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';

/**
 * 不确定性标记
 */
export interface UncertaintyFlags {
  /** 缺失的关键数据 */
  missing_critical_data: string[];
  /** 过期数据警告 */
  stale_data_warnings: string[];
  /** 证据冲突 */
  conflicting_evidence: string[];
  /** 是否需要澄清 */
  requires_clarification: boolean;
  /** 需要澄清的点 */
  clarification_points?: string[];
  /** 整体置信度 */
  confidence_level: ConfidenceLevel;
  /** 不确定性原因 */
  uncertainty_reasons?: string[];
}

// ============================================================================
// TripNARA 门控决策上下文
// ============================================================================

/**
 * 门控决策上下文
 */
export interface GateContext {
  /** Abu 门控结果 */
  abu_gate_result: GateResult;
  /** Dr.Dre 节奏评估 */
  dre_rhythm_assessment?: {
    pace_score: number;
    rhythm_pattern: string;
    fatigue_risk: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendations?: string[];
  };
  /** Neptune 在地检查 */
  neptune_local_check?: {
    local_accuracy_score: number;
    poi_verification_status: Record<string, 'VERIFIED' | 'UNVERIFIED' | 'CLOSED'>;
    local_insights?: string[];
  };
  /** 门控使用的证据ID */
  gate_evidence_refs: string[];
  /** 门控决策时间 */
  gate_decision_time?: string;
}

// ============================================================================
// State（状态）定义
// ============================================================================

/**
 * State（状态）- 规划请求的上下文
 * 
 * [基础版本] 保持向后兼容
 */
export interface RLState {
  request_id: string;
  trip_id?: string;
  user_request: string; // 用户原始请求
  origin?: string | { lat: number; lng: number };
  destination?: string | { lat: number; lng: number };
  date_range?: {
    start_date: string;
    end_date: string;
  };
  constraints?: Record<string, any>; // 用户约束（预算、时间窗口等）
  preferences?: Record<string, any>; // 用户偏好
  research_data?: Record<string, any>; // 研究数据
  gate_result?: GateResult; // Gate结果
  compliance_result?: ComplianceResult; // 合规结果
  current_itinerary?: Itinerary; // 当前行程状态
  decision_history?: DecisionLogEntry[]; // 历史决策
  metadata?: {
    country_code?: string;
    model_version?: string;
    timestamp?: string;
  };
}

/**
 * TripNARA 增强版 State
 * 
 * 包含风险层特征、证据引用、不确定性标记、门控上下文
 */
export interface TripNARARLState extends RLState {
  // === 风险层特征 (Risk Layers) ===
  risk_summary: RiskSummary;

  // === 证据引用 (Evidence) ===
  evidence: EvidenceRef[];

  // === 不确定性标记 (Uncertainty) ===
  uncertainty_flags: UncertaintyFlags;

  // === 门控决策上下文 ===
  gate_context: GateContext;
}

/**
 * Action（动作）- Agent的决策动作
 */
export interface RLAction {
  action_type: 'PLAN_GENERATE' | 'ROUTE_ADJUST' | 'PACE_ADJUST' | 'BUDGET_ADJUST' | 'TRANSPORT_SELECT' | 'POI_SELECT' | 'GATE_CHECK' | 'COMPLIANCE_CHECK' | 'USER_CLARIFICATION';
  action_params: Record<string, any>; // 动作参数
  reasoning?: string; // 决策推理
  decision_point?: string; // 决策点标识
  actor?: string; // 执行者（Abu/Dr.Dre/Neptune）
  alternatives_considered?: Array<{
    option: any;
    score?: number;
    reason?: string;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Reward（奖励）- 用户反馈和验证结果
 */
export interface RLReward {
  total_reward: number; // 总奖励值（归一化到0-1）
  reward_signals: RewardSignal[]; // 奖励信号列表
  validation_score?: number; // 验证分数（0-1）
  user_approval?: ApprovalStatus; // 用户审批状态
  execution_success?: boolean; // 执行是否成功
  metadata?: Record<string, any>;
}

/**
 * RL轨迹步骤（s,a,r,s'）
 */
export interface RLTrajectoryStep {
  step_index: number; // 步骤索引
  state: RLState; // 当前状态
  action: RLAction; // 执行的动作
  reward: RLReward; // 获得的奖励
  next_state?: RLState; // 下一状态（如果存在）
  timestamp: string; // ISO 8601
}

/**
 * RL轨迹（完整轨迹）
 */
export interface RLTrajectory {
  trajectory_id: string;
  request_id: string;
  trip_id?: string;
  steps: RLTrajectoryStep[]; // 轨迹步骤序列
  metadata: {
    model_version: string;
    country_code?: string;
    created_at: string;
    updated_at: string;
    validation_status: 'VALIDATED' | 'REJECTED' | 'PENDING';
    validation_score?: number;
    total_reward: number;
  };
}

/**
 * ETL提取选项
 */
export interface TrajectoryETLOptions {
  trajectory_ids?: string[]; // 指定轨迹ID列表
  request_ids?: string[]; // 指定请求ID列表
  min_validation_score?: number; // 最小验证分数
  min_total_reward?: number; // 最小总奖励
  model_version?: string; // 模型版本过滤
  country_code?: string; // 国家代码过滤
  date_range?: {
    start: string; // ISO 8601
    end: string; // ISO 8601
  };
  limit?: number; // 限制数量
  offset?: number; // 偏移量
}

/**
 * ETL导出格式
 */
export type ETLExportFormat = 'jsonl' | 'parquet' | 'json';

/**
 * ETL导出结果
 */
export interface ETLExportResult {
  format: ETLExportFormat;
  file_path: string;
  record_count: number;
  file_size_bytes: number;
  metadata: {
    exported_at: string;
    trajectory_ids: string[];
    stats: {
      total_steps: number;
      avg_reward: number;
      avg_validation_score: number;
    };
  };
}
