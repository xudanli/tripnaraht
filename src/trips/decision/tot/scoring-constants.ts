// src/trips/decision/tot/scoring-constants.ts

/**
 * 评分常量配置
 * 
 * 集中管理所有阈值和系数，方便调参
 */

/**
 * 成本评分常量
 */
export const COST_CONSTANTS = {
  /** 超预算指数惩罚系数 */
  OVER_BUDGET_PENALTY_K: 4.0,
  /** 理想预算占比下限 */
  IDEAL_BUDGET_RATIO_MIN: 0.85,
  /** 理想预算占比上限 */
  IDEAL_BUDGET_RATIO_MAX: 1.0,
  /** 太省钱的惩罚系数 */
  TOO_SAVE_PENALTY: 0.2,
  /** 理想区间下降系数 */
  IDEAL_DECLINE_FACTOR: 0.3,
} as const;

/**
 * 风险评分常量
 */
export const RISK_CONSTANTS = {
  /** Slack 阈值（分钟），<30 开始线性变差 */
  SLACK_THRESHOLD_MIN: 30,
  /** Buffer 增益半衰期（分钟） */
  BUFFER_HALF_LIFE_MIN: 60,
  /** 活动风险权重 */
  ACTIVITY_RISK_WEIGHT: 0.35,
  /** 紧张度权重 */
  TIGHTNESS_WEIGHT: 0.25,
  /** 鲁棒性风险权重 */
  ROBUST_RISK_WEIGHT: 0.25,
  /** 预订压力权重 */
  BOOKING_PRESSURE_WEIGHT: 0.15,
  /** 风险基础得分权重 */
  RISK_BASE_WEIGHT: 0.7,
  /** 鲁棒性加成权重 */
  ROBUST_BOOST_WEIGHT: 0.3,
} as const;

/**
 * 偏好评分常量
 */
export const PREF_CONSTANTS = {
  /** 多样性阈值（最大标签占比） */
  DIVERSITY_THRESHOLD: 0.45,
  /** 多样性惩罚分母 */
  DIVERSITY_PENALTY_DENOM: 0.55,
  /** 意图匹配权重 */
  INTENT_WEIGHT: 0.65,
  /** 质量权重 */
  QUALITY_WEIGHT: 0.25,
  /** 必看权重 */
  MUST_SEE_WEIGHT: 0.10,
  /** 质量分数权重 */
  QUALITY_SCORE_WEIGHT: 0.6,
  /** 独特性分数权重 */
  UNIQUENESS_SCORE_WEIGHT: 0.4,
  /** 不喜欢标签扣分系数 */
  DISLIKE_PENALTY: 0.3,
} as const;

/**
 * 时间窗评分常量
 */
export const TIME_CONSTANTS = {
  /** 利用率阈值下限 */
  UTIL_THRESHOLD_MIN: 0.35,
  /** 利用率权重 */
  UTIL_WEIGHT: 0.45,
  /** 流程权重 */
  FLOW_WEIGHT: 0.35,
  /** 窗口权重 */
  WINDOW_WEIGHT: 0.20,
  /** 关键窗口 slack 阈值（分钟） */
  CRITICAL_WINDOW_SLACK_MIN: 30,
} as const;

/**
 * 必达点评分常量
 */
export const REQ_CONSTANTS = {
  /** 覆盖率权重 */
  COVERAGE_WEIGHT: 0.70,
  /** 价值权重 */
  VALUE_WEIGHT: 0.25,
  /** 优先级损失权重 */
  PRIORITY_LOSS_WEIGHT: 0.30,
  /** 归一化 scale 最小值 */
  NORMALIZE_SCALE_MIN: 100,
  /** 高优先级阈值 */
  HIGH_PRIORITY_THRESHOLD: 2,
  /** 高 penalty 阈值（用于判断硬节点） */
  HIGH_PENALTY_THRESHOLD: 50,
} as const;

/**
 * 权重调整常量
 */
export const WEIGHT_ADJUST_CONSTANTS = {
  /** Pacing 调整幅度 */
  PACING_ADJUST: {
    relaxed: { pref: 0.10, risk: 0.10, time: -0.10 },
    intense: { time: 0.15, risk: -0.05, cost: -0.10 },
  },
  /** RiskTolerance 调整幅度 */
  RISK_TOLERANCE_ADJUST: {
    low: { risk: 0.15, req: 0.05, pref: -0.10, time: -0.10 },
    high: { risk: -0.10, pref: 0.10, time: 0.05, cost: -0.05 },
  },
  /** BudgetStyle 调整幅度 */
  BUDGET_STYLE_ADJUST: {
    low: { cost: 0.20, pref: -0.10, time: -0.10 },
    high: { cost: -0.10, pref: 0.10, time: 0.05, risk: -0.05 },
  },
  /** 必达点强制保护 */
  REQ_PROTECTION: {
    minWeight: 0.25,
    minWeightWithManyHardNodes: 0.35,
    manyHardNodesThreshold: 3,
  },
} as const;

/**
 * 硬门控常量
 */
export const HARD_GATE_CONSTANTS = {
  /** 严重超时阈值（分钟） */
  SEVERE_OVERTIME_THRESHOLD_MIN: 30,
  /** 默认日时长（分钟） */
  DEFAULT_DAY_DURATION_MIN: 14 * 60,
} as const;

