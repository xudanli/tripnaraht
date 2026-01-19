// src/agent/assistants/trip-planner/interfaces/route-optimization.interface.ts
/**
 * 路线优化证据接口
 * 
 * 符合路线优化工程师规范：
 * - 结论 + 证据 + 可执行下一步
 * - 硬门控规则与软评分维度
 * - 数据时间戳与过期策略
 */

/**
 * 硬门控规则类型
 */
export type HardGateRule = 
  | 'REACHABILITY'           // 可达性
  | 'SAFETY'                 // 安全性
  | 'DATA_MISSING'           // 关键数据缺失
  | 'TIME_CONFLICT'          // 时间冲突
  | 'GEO_IMPOSSIBLE'         // 地理位置不可能（如同一天跨越1000km）
  | 'OPENING_HOURS'          // 开放时间
  | 'TRANSFER_BUFFER';       // 换乘时间不足

/**
 * 软评分维度
 */
export type SoftScoreDimension = 
  | 'FATIGUE'      // 疲劳评分
  | 'PACE'         // 节奏评分
  | 'EXPERIENCE'   // 体验评分
  | 'EFFICIENCY';  // 效率评分

/**
 * 硬门控结果
 */
export interface HardGateResult {
  rule: HardGateRule;
  result: 'PASS' | 'FAIL';
  severity: 'ERROR' | 'WARNING';
  detail: string;
  suggestion?: string;
  evidence_ref?: string;
  
  // 关联数据
  day?: number;
  item_id?: string;
  affected_items?: string[];
}

/**
 * 软评分结果
 */
export interface SoftScoreResult {
  dimension: SoftScoreDimension;
  score: number;          // 0-100
  threshold: number;      // 超过此值需要警告
  exceeded: boolean;
  weight: number;         // 0-1
  detail?: string;
  suggestion?: string;
}

/**
 * 替代方案策略
 */
export type AlternativeStrategy = 
  | 'REMOVE_POI'           // 移除 POI
  | 'CHANGE_DAY'           // 改到其他天
  | 'ADD_BUFFER'           // 增加缓冲时间
  | 'CHANGE_TRANSPORT'     // 更换交通方式
  | 'ADJUST_TIME'          // 调整时间
  | 'REPLACE_POI';         // 替换为其他 POI

/**
 * 替代方案
 */
export interface RouteAlternative {
  id: string;
  strategy: AlternativeStrategy;
  priority: number;        // 1-10，越大越推荐
  description: string;
  impact: {
    time_change_minutes?: number;
    cost_change?: number;
    removed_items?: string[];
    added_items?: string[];
  };
  confidence: number;      // 0-1
  evidence_ref?: string;
}

/**
 * 数据时间戳
 */
export interface DataTimestamp {
  data_source: string;
  retrieved_at: string;    // ISO 8601
  data_timestamp?: string;
  expiration_policy: {
    type: 'FIXED_DURATION' | 'EVENT_BASED';
    duration_hours?: number;
    event?: string;
  };
  is_expired: boolean;
}

/**
 * 下一步动作
 */
export interface NextStepAction {
  action: 'APPLY' | 'ADJUST' | 'REJECT' | 'CONFIRM' | 'AUTO_FIX';
  route_id?: string;
  alternative_id?: string;
  message: string;
  requires_user_confirmation: boolean;
}

/**
 * 路线优化证据（完整结构）
 */
export interface RouteOptimizationEvidence {
  /** 证据 ID */
  evidence_id: string;
  
  /** 生成时间 */
  generated_at: string;
  
  /** 行程 ID */
  trip_id: string;
  
  // ========== 结论 ==========
  conclusion: {
    /** 路线是否批准 */
    route_approved: boolean;
    /** 拒绝原因 */
    rejection_reasons?: string[];
    /** 是否需要调整 */
    adjustment_required: boolean;
    /** 总体可执行性评分 (0-100) */
    executability_score: number;
    /** 置信度 */
    confidence: number;
  };
  
  // ========== 硬门控结果 ==========
  hard_gates: HardGateResult[];
  
  // ========== 软评分结果 ==========
  soft_scores: {
    fatigue: SoftScoreResult;
    pace: SoftScoreResult;
    experience: SoftScoreResult;
    efficiency: SoftScoreResult;
    overall: number;  // 加权总分
  };
  
  // ========== 关键特征 ==========
  key_features: {
    /** 总天数 */
    total_days: number;
    /** 总活动数 */
    total_activities: number;
    /** 涉及城市 */
    cities_involved: string[];
    /** 最大单日距离 (km) */
    max_daily_distance_km?: number;
    /** 最大单日活动时间 (分钟) */
    max_daily_activity_minutes?: number;
    /** 跨城市段 */
    cross_city_segments?: Array<{
      day: number;
      from_city: string;
      to_city: string;
      distance_km: number;
      estimated_travel_minutes: number;
    }>;
    /** 🆕 夜间段 */
    night_segments?: Array<{
      day: number;
      start: string;  // ISO 8601
      end: string;    // ISO 8601
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      description?: string;
    }>;
    /** 🆕 无救援段 */
    no_rescue_segments?: Array<{
      day: number;
      start: string;  // ISO 8601
      end: string;    // ISO 8601
      distance_km: number;
      risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
      description?: string;
    }>;
    /** 时间冲突数 */
    time_conflicts: number;
    /** 数据缺失项 */
    missing_data: string[];
  };
  
  // ========== 替代方案 ==========
  alternatives: RouteAlternative[];
  
  // ========== 🆕 候选路线（多策略、多次采样） ==========
  candidate_routes?: {
    /** 候选路线列表 */
    routes: Array<{
      id: string;
      strategy: 'COMPACT' | 'BALANCED' | 'RELAXED';
      score: number;
      description: string;
      key_features: {
        total_duration_minutes: number;
        total_distance_km: number;
        activity_count: number;
        fatigue_score: number;
        pace_score: number;
      };
    }>;
    /** 最佳候选路线 ID */
    best_route_id?: string;
    /** 统计信息 */
    statistics: {
      total_generated: number;
      successful: number;
      failed: number;
    };
  };
  
  // ========== 数据时间戳 ==========
  data_timestamps: DataTimestamp[];
  
  // ========== 可执行下一步 ==========
  next_steps: NextStepAction[];
  
  // ========== 原始验证结果（来自 itinerary.verify skill）==========
  raw_verification?: {
    verified: boolean;
    issues: Array<{
      type: string;
      severity: string;
      message: string;
      suggestion?: string;
    }>;
    summary: {
      total_issues: number;
      error_count: number;
      warning_count: number;
    };
  };
}

/**
 * 路线优化请求
 */
export interface RouteOptimizationRequest {
  trip_id: string;
  user_id?: string;
  
  /** 优化目标 */
  optimization_goal?: 'BALANCE' | 'COMPACT' | 'RELAXED' | 'EFFICIENT';
  
  /** 🆕 目标函数权重（0-1，总和应为 1） */
  weights?: {
    comfort?: number;    // 舒适度（路线舒适、不疲劳）
    efficiency?: number; // 效率（时间最短、路径最优）
    safety?: number;      // 安全（避开风险、有救援支持）
    scenic?: number;      // 景观（风景优美、体验佳）
  };
  
  /** 约束条件 */
  constraints?: {
    max_daily_activities?: number;
    max_daily_hours?: number;
    must_include_pois?: string[];
    must_exclude_pois?: string[];
    preferred_transport?: string[];
  };
  
  /** 是否生成替代方案 */
  generate_alternatives?: boolean;
  
  /** 最大替代方案数量 */
  max_alternatives?: number;
  
  /** 🆕 是否生成候选路线（多策略、多次采样） */
  generate_candidate_routes?: boolean;
  
  /** 🆕 候选路线生成配置 */
  candidate_route_config?: {
    /** 策略类型 */
    strategies?: Array<'COMPACT' | 'BALANCED' | 'RELAXED'>;
    /** 每个策略的采样次数 */
    samples_per_strategy?: number;
    /** 是否使用多起点 */
    use_multiple_starts?: boolean;
  };
}

/**
 * 评估指标（用于追踪和埋点）
 */
export interface RouteOptimizationMetrics {
  /** 请求 ID */
  request_id: string;
  
  /** 可执行成功率：路线是否通过验证 */
  executable: boolean;
  
  /** 拒绝合理率：拒绝原因是否合理 */
  rejection_reasonable?: boolean;
  
  /** 替代接受率：用户是否接受替代方案 */
  alternative_accepted?: boolean;
  
  /** 硬门控命中数 */
  hard_gate_hits: number;
  
  /** 软评分均值 */
  soft_score_average: number;
  
  /** 生成替代方案数 */
  alternatives_generated: number;
  
  /** 处理时间 (ms) */
  processing_time_ms: number;
  
  /** 数据完整度 (0-1) */
  data_completeness: number;
}

/**
 * 缺失数据策略
 */
export interface MissingDataStrategy {
  critical_data_missing: {
    strategy: 'REJECT';
    message: string;
    required_fields: string[];
  };
  
  partial_data_missing: {
    strategy: 'WARN_AND_CONTINUE' | 'GENERATE_ALTERNATIVES';
    message: string;
    missing_fields: string[];
    use_assumption: boolean;
    assumption_source?: string;
  };
}
