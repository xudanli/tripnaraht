// src/trips/decision/constraints/constraint-dsl.types.ts

/**
 * 约束DSL类型定义
 * 
 * 统一的多约束决策系统约束定义语言
 * 支持硬约束（不可违反）和软约束（可权衡）
 */

import { ISODate, MoneyCurrency } from '../world-model';

/**
 * 约束DSL根类型
 */
export interface ConstraintDSL {
  hard_constraints?: HardConstraints;
  soft_constraints?: SoftConstraints;
  conflicts?: ConstraintConflict[];
}

/**
 * 硬约束（Hard Constraints）
 * 
 * 规则：不满足 = 方案直接作废
 * 系统行为：不评分，只判断 feasible / infeasible
 */
export interface HardConstraints {
  /**
   * 日期窗口约束
   */
  date_window?: {
    start: ISODate; // ISO 8601格式，如 '2026-06-10'
    end: ISODate;   // ISO 8601格式，如 '2026-06-20'
    flexible: boolean; // 是否允许调整日期
  };

  /**
   * 预算约束
   */
  budget?: {
    max: number;        // 最大预算金额
    currency: MoneyCurrency; // 货币单位
    flexible: boolean;  // 是否允许超支
  };

  /**
   * 物理限制
   */
  physical_limitations?: {
    no_long_hiking?: boolean;           // 禁止长距离徒步
    daily_activity_hours_max?: number;  // 每日最大活动小时数
    wheelchair_accessible?: boolean;    // 必须轮椅可达
    no_stairs?: boolean;                // 禁止楼梯
    max_daily_ascent_m?: number;        // 每日最大爬升（米）
    max_elevation_m?: number;           // 最大海拔（米）
    max_slope_pct?: number;             // 最大坡度（百分比）
    rapid_ascent_forbidden?: boolean;   // 禁止快速爬升
  };

  /**
   * 交通方式约束
   */
  travel_mode?: {
    allow_self_drive?: boolean;      // 允许自驾
    allow_public_transit?: boolean;  // 允许公共交通
    max_transfers?: number;          // 最大换乘次数
    no_early_morning?: boolean;      // 禁止早起（如早于7点）
    no_late_night?: boolean;          // 禁止夜车（如晚于22点）
  };

  /**
   * 许可和向导要求
   */
  requirements?: {
    requires_permit?: boolean;  // 需要许可证
    requires_guide?: boolean;   // 需要向导
  };
}

/**
 * 软约束（Soft Constraints）
 * 
 * 规则：可妥协，可加权
 * 系统行为：参与评分，可动态调整权重，用于方案排序 & 解释
 */
export interface SoftConstraints {
  /**
   * 节奏偏好
   */
  pace?: {
    preference: 'relaxed' | 'moderate' | 'intense';
    weight: number; // 0-1，权重
  };

  /**
   * 风景偏好
   */
  scenery?: {
    nature_vs_city: 'nature' | 'city' | 'balanced';
    weight: number; // 0-1
  };

  /**
   * 摄影重要性
   */
  photography?: {
    importance: number; // 0-1
  };

  /**
   * 舒适度偏好
   */
  comfort_level?: {
    hotel_quality: 'low' | 'medium' | 'high';
    weight: number; // 0-1
  };

  /**
   * 活动强度偏好
   */
  activity_intensity?: {
    preference: 'low' | 'medium' | 'high';
    weight: number; // 0-1
  };

  /**
   * 风险容忍度
   */
  risk_tolerance?: {
    level: 'low' | 'medium' | 'high';
    weight: number; // 0-1
  };

  /**
   * 成本敏感度
   */
  cost_sensitivity?: {
    level: 'low' | 'medium' | 'high'; // low = 不敏感（愿意花钱），high = 敏感（省钱）
    weight: number; // 0-1
  };
}

/**
 * 约束冲突
 * 
 * 描述两个或多个约束之间的冲突关系
 */
export interface ConstraintConflict {
  /**
   * 冲突涉及的约束名称数组
   * 如 ['budget', 'hotel_quality']
   */
  between: string[];

  /**
   * 冲突描述
   */
  description: string;

  /**
   * 冲突严重程度
   */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /**
   * 权衡选项（如何解决冲突）
   */
  tradeoff_options: string[];

  /**
   * 受影响的日期（可选）
   */
  affected_days?: number[];

  /**
   * 冲突详情（可选）
   */
  details?: Record<string, any>;
}

/**
 * 约束冲突检测结果
 */
export interface ConstraintConflictResult {
  conflicts: ConstraintConflict[];
  has_conflicts: boolean;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

/**
 * 权衡解释
 * 
 * 解释某个冲突的权衡选项及其影响
 */
export interface TradeoffExplanation {
  conflict_type: string; // 冲突类型，如 'budget vs hotel_quality'
  current_state: {
    constraint_a_value: any;
    constraint_b_value: any;
    conflict_reason: string;
  };
  options: Array<{
    option: string; // 权衡选项描述
    impact: {
      constraint_a_change: string;
      constraint_b_change: string;
      overall_impact: 'positive' | 'negative' | 'neutral';
    };
    recommendation: 'recommended' | 'optional' | 'not_recommended';
  }>;
}
