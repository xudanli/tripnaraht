// src/trips/decision/optimization/objective-function.interface.ts
/**
 * TripNARA 统一目标函数接口
 * 
 * Phase 1: 从规则系统升级为优化系统
 * 
 * 设计原则：
 * 1. 目标函数是所有决策的统一优化目标
 * 2. Abu/Dre/Neptune 成为优化器，而不是规则引擎
 * 3. 权重可配置，Phase 2 可学习
 * 4. 所有决策都有可解释的效用分解
 */

import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';

/**
 * 目标函数权重（Phase 1: 可配置，Phase 2: 可学习）
 * 
 * 对应公式：
 * ExpectedUtility = w1×Safety + w2×Experience + w3×Philosophy 
 *                 - w4×FatigueRisk - w5×WeatherRisk - w6×BudgetRisk
 *                 - w7×PacingVariance + w8×TimeSlack
 */
export interface ObjectiveFunctionWeights {
  // ========== 正向目标（最大化）==========
  
  /** w1: 安全性权重 (0-1) - Abu 主导 */
  safety: number;
  
  /** w2: 体验密度权重 (0-1) - 体验质量 × 覆盖率 */
  experienceDensity: number;
  
  /** w3: 路线哲学匹配度权重 (0-1) - Neptune 主导 */
  philosophyAlignment: number;
  
  /** w8: 时间余量权重 (0-1) - 留有缓冲 */
  timeSlack: number;

  // ========== 负向惩罚（最小化）==========
  
  /** w4: 疲劳风险权重 (0-1) - Dre 主导 */
  fatigueRisk: number;
  
  /** w5: 天气风险权重 (0-1) */
  weatherRisk: number;
  
  /** w6: 预算超支风险权重 (0-1) */
  budgetOverrun: number;
  
  /** w7: 节奏方差权重 (0-1) - 越低越好 */
  pacingVariance: number;
}

/**
 * 默认权重配置
 */
export const DEFAULT_OBJECTIVE_WEIGHTS: ObjectiveFunctionWeights = {
  // 正向
  safety: 0.25,
  experienceDensity: 0.20,
  philosophyAlignment: 0.15,
  timeSlack: 0.10,
  // 负向
  fatigueRisk: 0.15,
  weatherRisk: 0.05,
  budgetOverrun: 0.05,
  pacingVariance: 0.05,
};

/**
 * 硬约束类型
 */
export type HardConstraintType =
  | 'DEM_VIOLATION'           // 地形违规
  | 'ROAD_CLOSED'             // 道路关闭
  | 'HAZARD_ZONE'             // 危险区域
  | 'COMPLIANCE_VIOLATION'    // 合规违规
  | 'FERRY_CANCELLED'         // 渡轮取消
  | 'ALTITUDE_LIMIT'          // 海拔限制
  | 'SEASON_CLOSED';          // 季节关闭

/**
 * 软约束类型
 */
export type SoftConstraintType =
  | 'FATIGUE_THRESHOLD'       // 疲劳阈值
  | 'ROLLING_ASCENT'          // 滚动爬升
  | 'BUDGET_LIMIT'            // 预算限制
  | 'WEATHER_WARNING'         // 天气警告
  | 'TIME_PRESSURE'           // 时间压力
  | 'PHILOSOPHY_DRIFT';       // 哲学偏离

/**
 * 约束定义
 */
export interface Constraint {
  /** 约束唯一标识 */
  id: string;
  
  /** 约束类型 */
  type: HardConstraintType | SoftConstraintType;
  
  /** 是否为硬约束 */
  isHard: boolean;
  
  /** 约束描述 */
  description: string;
  
  /** 约束阈值（软约束用） */
  threshold?: number;
  
  /** 违反时的惩罚系数（软约束用） */
  penaltyFactor?: number;
  
  /** 关联的证据 ID */
  evidenceRefs?: string[];
}

/**
 * 约束满足度结果
 */
export interface ConstraintSatisfactionResult {
  /** 约束 ID */
  constraintId: string;
  
  /** 是否满足 */
  satisfied: boolean;
  
  /** 满足度分数 (0-1, 1=完全满足) */
  satisfactionScore: number;
  
  /** 违反程度 (0=无违反, >0=违反程度) */
  violationDegree: number;
  
  /** 违反说明 */
  violationExplanation?: string;
  
  /** 修复建议 */
  repairSuggestion?: string;
}

/**
 * 目标函数评估结果
 */
export interface ObjectiveEvaluationResult {
  /** 总效用值 (归一化到 0-1) */
  totalUtility: number;
  
  /** 效用分解 */
  breakdown: {
    // 正向贡献
    safetyScore: number;
    experienceScore: number;
    philosophyScore: number;
    timeSlackScore: number;
    // 负向惩罚
    fatigueRiskPenalty: number;
    weatherRiskPenalty: number;
    budgetOverrunPenalty: number;
    pacingVariancePenalty: number;
  };
  
  /** 加权后分数 */
  weightedScores: {
    safety: number;
    experience: number;
    philosophy: number;
    timeSlack: number;
    fatigue: number;
    weather: number;
    budget: number;
    pacing: number;
  };
  
  /** 约束满足情况 */
  constraints: {
    /** 硬约束违反列表 */
    hardViolations: ConstraintSatisfactionResult[];
    /** 软约束违反列表 */
    softViolations: ConstraintSatisfactionResult[];
    /** 整体约束满足度 */
    overallSatisfaction: number;
  };
  
  /** 是否可行（所有硬约束满足） */
  isFeasible: boolean;
  
  /** 详细指标（用于调试和可视化） */
  metrics: Record<string, number>;
  
  /** 评估时间戳 */
  evaluatedAt: string;
}

/**
 * 目标函数接口
 * 
 * 核心方法：
 * - evaluate: 评估计划的总效用
 * - computePartial: 计算单个维度的分数
 * - checkConstraints: 检查约束满足情况
 */
export interface IObjectiveFunction {
  /** 当前权重配置 */
  readonly weights: ObjectiveFunctionWeights;
  
  /** 硬约束列表 */
  readonly hardConstraints: Constraint[];
  
  /** 软约束列表 */
  readonly softConstraints: Constraint[];
  
  /**
   * 评估计划的总效用
   * 
   * @param plan 待评估的计划
   * @param world 世界模型上下文
   * @returns 评估结果
   */
  evaluate(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ObjectiveEvaluationResult;
  
  /**
   * 计算单个维度的分数
   * 
   * @param dimension 维度名称
   * @param plan 待评估的计划
   * @param world 世界模型上下文
   * @returns 该维度的分数 (0-1)
   */
  computeDimensionScore(
    dimension: keyof ObjectiveFunctionWeights,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): number;
  
  /**
   * 检查约束满足情况
   * 
   * @param plan 待检查的计划
   * @param world 世界模型上下文
   * @returns 约束满足结果列表
   */
  checkConstraints(
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): ConstraintSatisfactionResult[];
  
  /**
   * 更新权重（用于 Phase 2 学习）
   * 
   * @param newWeights 新权重
   */
  updateWeights(newWeights: Partial<ObjectiveFunctionWeights>): void;
}

/**
 * 候选方案比较结果
 */
export interface CandidateComparisonResult {
  /** 最佳方案索引 */
  bestIndex: number;
  
  /** 所有方案的评估结果 */
  evaluations: ObjectiveEvaluationResult[];
  
  /** 排序（按总效用降序） */
  ranking: number[];
  
  /** 帕累托前沿（多目标优化） */
  paretoFrontier?: number[];
  
  /** 方案间的权衡分析 */
  tradeoffAnalysis: {
    /** 方案 A vs 方案 B 的权衡 */
    pairwise: Array<{
      indexA: number;
      indexB: number;
      advantagesA: string[];
      advantagesB: string[];
      recommendation: 'A' | 'B' | 'EQUAL';
    }>;
  };
}

/**
 * 优化目标（用于 Abu/Dre/Neptune 优化器）
 */
export interface OptimizationObjective {
  /** 优化方向 */
  direction: 'MAXIMIZE' | 'MINIMIZE';
  
  /** 目标函数 */
  objectiveFunction: IObjectiveFunction;
  
  /** 优化维度（可指定只优化某些维度） */
  targetDimensions?: (keyof ObjectiveFunctionWeights)[];
  
  /** 约束条件 */
  constraints: Constraint[];
  
  /** 最大迭代次数 */
  maxIterations?: number;
  
  /** 收敛阈值 */
  convergenceThreshold?: number;
}

/**
 * 优化结果
 */
export interface OptimizationResult {
  /** 优化后的计划 */
  optimizedPlan: RoutePlanDraft;
  
  /** 优化前的评估 */
  beforeEvaluation: ObjectiveEvaluationResult;
  
  /** 优化后的评估 */
  afterEvaluation: ObjectiveEvaluationResult;
  
  /** 效用提升 */
  utilityImprovement: number;
  
  /** 迭代次数 */
  iterations: number;
  
  /** 是否收敛 */
  converged: boolean;
  
  /** 优化路径（调试用） */
  optimizationPath?: Array<{
    iteration: number;
    utility: number;
    action: string;
  }>;
}
