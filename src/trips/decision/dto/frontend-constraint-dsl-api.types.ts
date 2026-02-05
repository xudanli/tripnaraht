// src/trips/decision/dto/frontend-constraint-dsl-api.types.ts
/**
 * 约束DSL API 前端TypeScript类型定义
 * 
 * 前端可以直接导入这些类型使用
 */

/**
 * API响应基础类型
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * 约束DSL类型
 */
export interface ConstraintDSL {
  hard_constraints?: {
    date_window?: {
      start: string; // ISO 8601
      end: string;
      flexible: boolean;
    };
    budget?: {
      max: number;
      currency: string;
      flexible: boolean;
    };
    physical_limitations?: {
      no_long_hiking?: boolean;
      daily_activity_hours_max?: number;
      wheelchair_accessible?: boolean;
      no_stairs?: boolean;
    };
    travel_mode?: {
      allow_self_drive?: boolean;
      allow_public_transit?: boolean;
      max_transfers?: number;
      no_early_morning?: boolean;
      no_late_night?: boolean;
    };
  };
  soft_constraints?: {
    pace?: {
      preference: 'relaxed' | 'moderate' | 'intense';
      weight: number; // 0-1
    };
    scenery?: {
      nature_vs_city: 'nature' | 'city' | 'balanced';
      weight: number;
    };
    photography?: {
      importance: number; // 0-1
    };
    comfort_level?: {
      hotel_quality: 'low' | 'medium' | 'high';
      weight: number;
    };
  };
}

/**
 * 约束冲突
 */
export interface ConstraintConflict {
  between: string[]; // 约束名称数组
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tradeoff_options: string[];
  affected_days?: number[];
  details?: Record<string, any>;
}

/**
 * 冲突检测响应
 */
export interface DetectConflictsResponse {
  conflicts: ConstraintConflict[];
  has_conflicts: boolean;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * 不可行性原因
 */
export interface InfeasibilityReason {
  constraint: string;
  description: string;
  affected_activities?: Array<{
    activity: string;
    message: string;
  }>;
  fix_suggestions: string[];
}

/**
 * 不可行性解释
 */
export interface InfeasibilityExplanation {
  feasible: boolean;
  reasons: InfeasibilityReason[];
  summary?: string;
}

/**
 * 约束检查响应
 */
export interface CheckConstraintsResponse {
  isValid: boolean;
  violations: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    details?: Record<string, any>;
    suggestions?: string[];
  }>;
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  conflicts?: DetectConflictsResponse;
  infeasibilityExplanation?: InfeasibilityExplanation;
}

/**
 * 方案评分
 */
export interface PlanScore {
  total: number;
  breakdown: {
    satisfaction: number;
    violationRisk: number;
    robustness: number;
    cost: number;
  };
}

/**
 * 权衡分析
 */
export interface Tradeoff {
  constraint: string;
  sacrificed: string;
  reason: string;
  can_adjust: boolean;
  impact_score?: number;
}

/**
 * 方案变体
 */
export interface PlanVariant {
  id: 'conservative' | 'balanced' | 'aggressive';
  score: PlanScore;
  tradeoffs: Tradeoff[];
  feasibility: {
    isValid: boolean;
    violations: number;
    conflicts?: number;
  };
  planSummary: {
    days: number;
    totalActivities: number;
  };
}

/**
 * 多方案生成响应
 */
export interface GenerateMultiplePlansResponse {
  variants: PlanVariant[];
  log: {
    runId: string;
    explanation: string;
  };
}
