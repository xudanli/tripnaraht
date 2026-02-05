// src/agent/interfaces/sub-agent.interface.ts

/**
 * 子 Agent 接口定义（基于 claude.md）
 * 
 * 规则：Orchestrator 拥有状态机并按顺序调用；
 * 子 Agent 只输出结构化 JSON 片段，由 Orchestrator 合并并写入 decision_log
 */

import { OrchestratorState, TripPlanRequest, GateResult, Itinerary, DecisionLogEntry } from './trip-plan.interface';

/**
 * Planner Agent
 * 
 * 职责：任务拆解、缺口清单、候选方案结构
 */
export interface PlannerAgent {
  /**
   * 解析请求并识别缺口
   */
  analyzeRequest(
    request: TripPlanRequest,
    context: OrchestratorState
  ): Promise<{
    intent: string;
    gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }>;
    candidate_structure?: {
      suggested_days: number;
      suggested_route?: string[];
      key_pois?: string[];
    };
  }>;
}

/**
 * Gatekeeper Agent
 * 
 * 职责：Should-Exist Gate 规则执行（硬门控+软评分）
 * 
 * 强制：Gate 在 Plan 之前执行
 */
export interface GatekeeperAgent {
  /**
   * 执行 Should-Exist Gate 评估
   */
  evaluateGate(
    request: TripPlanRequest,
    researchData: Record<string, any>,
    context: OrchestratorState
  ): Promise<GateResult>;
}

/**
 * Compliance Agent
 * 
 * 职责：风险提示/免责声明/用户确认留痕要求
 */
export interface ComplianceAgent {
  /**
   * 检查合规性并生成风险提示
   */
  checkCompliance(
    itinerary: Itinerary,
    gateResult: GateResult,
    context: OrchestratorState
  ): Promise<{
    risk_warnings: Array<{
      level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
      message: string;
      requires_user_confirmation: boolean;
    }>;
    disclaimers: string[];
    required_confirmations: string[];
  }>;
}

/**
 * LocalInsight Agent
 * 
 * 职责：替代点位/替代路线建议（无证据必须标 ASSUMPTION）
 */
export interface LocalInsightAgent {
  /**
   * 生成替代方案建议
   */
  suggestAlternatives(
    request: TripPlanRequest,
    gateResult: GateResult,
    context: OrchestratorState
  ): Promise<{
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
  }>;
}

/**
 * CoreDecision Agent
 * 
 * 职责：多候选方案权衡与最终选择
 */
export interface CoreDecisionAgent {
  /**
   * 权衡多个候选方案并做出最终决策
   */
  makeDecision(
    candidates: Array<{
      itinerary: Itinerary;
      score: number;
      pros: string[];
      cons: string[];
      evidence_refs: string[];
    }>,
    request: TripPlanRequest,
    context: OrchestratorState
  ): Promise<{
    selected_itinerary: Itinerary;
    decision_reasoning: string;
    rejected_candidates: Array<{
      itinerary_id: string;
      reason: string;
    }>;
  }>;
}

/**
 * Narrator Agent
 * 
 * 职责：用户可读输出（不得更改硬字段与证据字段）
 */
export interface NarratorAgent {
  /**
   * 生成用户可读的解释和故事
   * 
   * 重要：不得修改 itinerary 的硬字段（时间、地点、证据等）
   */
  narrate(
    itinerary: Itinerary,
    gateResult: GateResult,
    decisionLog: DecisionLogEntry[],
    context: OrchestratorState
  ): Promise<{
    user_friendly_summary: string;
    day_by_day_narrative: Array<{
      day: number;
      date: string;
      narrative: string;
    }>;
    highlights: string[];
    tips: string[];
    warnings?: string[];
  }>;
}

// ============================================================================
// Domain Agents（世界模型层）
// ============================================================================

/**
 * 地理坐标点
 */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * 证据引用
 */
export interface EvidenceRef {
  evidence_id: string;
  source: string;
  timestamp: string;
  data: any;
}

/**
 * 数据质量标注
 * 
 * 用于标识 Domain Agent 返回数据的可靠性和来源
 */
export interface DataQuality {
  /** 数据来源类型 */
  source_type: 'REALTIME_API' | 'CACHED' | 'HISTORICAL' | 'ESTIMATED' | 'MOCK';
  /** 数据新鲜度（距离获取的秒数） */
  freshness_seconds: number;
  /** 置信度 0-1 */
  confidence: number;
  /** 覆盖率 0-1（该区域数据的完整程度） */
  coverage: number;
  /** 数据获取时间 */
  retrieved_at: string;
  /** 数据过期时间（如果适用） */
  expires_at?: string;
  /** 降级信息（如果使用了降级数据源） */
  fallback_info?: {
    original_source: string;
    fallback_reason: string;
    quality_impact: 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT';
  };
}

/**
 * GeoAgent - 地理与路线 Agent
 * 
 * 职责：地理结构分析、路线可行性评估、空间关系计算
 */
export interface GeoAgent {
  /**
   * 分析地形
   */
  analyzeTerrain(
    route: GeoPoint[],
  ): Promise<{
    elevation_profile: Array<{ distance_km: number; elevation_m: number }>;
    total_ascent_m: number;
    total_descent_m: number;
    max_elevation_m: number;
    min_elevation_m: number;
    max_slope_deg: number;
    terrain_type: 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE';
    difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 检查路线可行性
   */
  checkRouteFeasibility(
    origin: GeoPoint,
    destination: GeoPoint,
    transportMode: 'DRIVE' | 'WALK' | 'CYCLE' | 'TRANSIT',
  ): Promise<{
    is_reachable: boolean;
    blocking_factors?: string[];
    estimated_duration_min: number;
    estimated_distance_km: number;
    difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
    confidence: number;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 查找附近 POI
   */
  findNearbyPOIs(
    center: GeoPoint,
    radius_km: number,
    categories?: string[],
  ): Promise<{
    pois: Array<{
      poi_id: string;
      name: string;
      category: string;
      location: GeoPoint;
      distance_km: number;
    }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;
}

/**
 * WeatherAgent - 气象与封路 Agent
 * 
 * 职责：天气预报分析、封路概率评估、气象风险量化
 */
export interface WeatherAgent {
  /**
   * 获取天气预报
   */
  getForecast(
    location: GeoPoint,
    dateRange: { start: string; end: string },
  ): Promise<{
    forecasts: Array<{
      date: string;
      temperature: { min: number; max: number };
      precipitation: { probability: number; type: string; amount_mm: number };
      wind: { speed_kmh: number; gust_kmh: number; direction: string };
      visibility_km: number;
      travel_suitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
    }>;
    overall_confidence: number;
    data_freshness: { last_update: string; reliability: number };
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 评估封路概率
   */
  assessRoadClosureProbability(
    route: GeoPoint[],
    date: string,
  ): Promise<{
    overall_closure_probability: number;
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    closure_factors: Array<{
      factor: 'SNOW' | 'ICE' | 'FLOODING' | 'WIND' | 'VISIBILITY' | 'OTHER';
      probability: number;
      impact: string;
    }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 量化气象风险
   */
  quantifyWeatherRisk(
    location: GeoPoint,
    date: string,
    activityType: 'DRIVING' | 'HIKING' | 'SIGHTSEEING' | 'OUTDOOR_ACTIVITY',
  ): Promise<{
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risk_score: number;
    risk_factors: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      description: string;
      mitigation: string;
    }>;
    what_you_pay_for: string;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;
}

/**
 * CostAgent - 价格与预算 Agent
 * 
 * 职责：价格曲线分析、预算优化、成本波动预测
 */
export interface CostAgent {
  /**
   * 估算行程成本
   */
  estimateTripCost(
    destination: string,
    dateRange: { start: string; end: string },
    travelers: number,
    preferences?: {
      accommodation_level?: 'BUDGET' | 'MID_RANGE' | 'LUXURY';
      dining_level?: 'BUDGET' | 'MID_RANGE' | 'FINE_DINING';
    },
  ): Promise<{
    total_estimate: {
      optimistic: number;
      expected: number;
      pessimistic: number;
      currency: string;
    };
    breakdown: {
      accommodation: number;
      transport: number;
      activities: number;
      dining: number;
      other: number;
    };
    confidence: number;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 分析价格曲线
   */
  analyzePriceCurve(
    service: 'FLIGHT' | 'HOTEL' | 'CAR_RENTAL',
    destination: string,
    dateRange: { start: string; end: string },
  ): Promise<{
    price_trend: Array<{ date: string; price: number }>;
    peak_periods: Array<{ start: string; end: string; multiplier: number }>;
    optimal_booking_window: { start: string; end: string };
    expected_saving_percent: number;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 优化预算分配
   */
  optimizeBudget(
    totalBudget: number,
    requirements: {
      destination: string;
      days: number;
      travelers: number;
      must_haves?: string[];
    },
  ): Promise<{
    recommended_allocation: {
      accommodation: { amount: number; percentage: number };
      transport: { amount: number; percentage: number };
      activities: { amount: number; percentage: number };
      dining: { amount: number; percentage: number };
      buffer: { amount: number; percentage: number };
    };
    feasibility: 'COMFORTABLE' | 'TIGHT' | 'INSUFFICIENT';
    saving_opportunities: Array<{
      category: string;
      suggestion: string;
      potential_saving: number;
      tradeoff: string;
    }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;
}

/**
 * ExperienceAgent - 体验与节奏 Agent
 * 
 * 职责：体验密度分析、节奏优化、疲劳预测
 */
export interface ExperienceAgent {
  /**
   * 分析体验密度
   */
  analyzeExperienceDensity(
    itinerary: Itinerary,
  ): Promise<{
    density_curve: Array<{
      time_slot: string;
      density: number;
      experience_type: 'SCENIC' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
    }>;
    peak_experiences: Array<{
      time: string;
      location: string;
      experience: string;
      intensity: number;
    }>;
    low_points: Array<{
      time: string;
      reason: string;
      suggestion: string;
    }>;
    quality_score: {
      overall: number;
      variety: number;
      depth: number;
      uniqueness: number;
    };
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 预测疲劳
   */
  predictFatigue(
    itinerary: Itinerary,
    userProfile: {
      fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
      age_group?: string;
    },
  ): Promise<{
    daily_fatigue: Array<{
      day: number;
      date: string;
      fatigue_curve: Array<{ time: string; fatigue_level: number }>;
      peak_fatigue: { time: string; level: number; cause: string };
      recovery_points: Array<{ time: string; recovery: number }>;
    }>;
    cumulative_fatigue: {
      trend: 'INCREASING' | 'STABLE' | 'DECREASING';
      end_of_trip_level: number;
      sustainable: boolean;
      warning?: string;
    };
    overexertion_probability: number;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 优化节奏
   */
  optimizePace(
    itinerary: Itinerary,
    preferences: {
      pace_priority: 'SLOW' | 'BALANCED' | 'FAST';
      fatigue_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    },
  ): Promise<{
    current_pace: 'TOO_SLOW' | 'RELAXED' | 'BALANCED' | 'BRISK' | 'TOO_FAST';
    optimizations: Array<{
      type: 'ADD_BUFFER' | 'REMOVE_ITEM' | 'REORDER' | 'SPLIT_DAY' | 'ADD_REST';
      target: string;
      reason: string;
      impact: {
        pace_improvement: string;
        experience_impact: string;
        tradeoff: string;
      };
    }>;
    optimal_pace_template: {
      morning: 'SLOW' | 'MODERATE' | 'FAST';
      afternoon: 'SLOW' | 'MODERATE' | 'FAST';
      evening: 'SLOW' | 'MODERATE' | 'FAST';
      rest_periods: string[];
    };
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;

  /**
   * 评估人体可执行性
   */
  assessHumanExecutability(
    itinerary: Itinerary,
    userProfile: {
      fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
      age_group?: string;
      special_needs?: string[];
    },
  ): Promise<{
    executability_score: number;
    breakdown: {
      physical_demand: number;
      mental_demand: number;
      time_stress: number;
      recovery_adequacy: number;
    };
    challenge_points: Array<{
      time: string;
      challenge: string;
      severity: 'MANAGEABLE' | 'CHALLENGING' | 'DIFFICULT' | 'EXTREME';
      adaptation: string;
    }>;
    human_tips: Array<{
      tip: string;
      timing: string;
      reason: string;
    }>;
    evidence: EvidenceRef[];
    data_quality: DataQuality;
  }>;
}
