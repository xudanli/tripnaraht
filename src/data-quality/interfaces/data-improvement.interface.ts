// src/data-quality/interfaces/data-improvement.interface.ts

/**
 * 数据持续改进接口定义
 * 
 * 基于 DATA_MODELING_COMPLIANCE.md 的P2要求：
 * - 学习循环
 * - 改进指标测量
 * - 改进验证机制
 */

/**
 * 改进指标类型
 */
export type ImprovementMetricType =
  | 'USER_SATISFACTION'    // 用户满意度
  | 'PREDICTION_ACCURACY'  // 预测准确度
  | 'DECISION_QUALITY'     // 决策质量
  | 'DATA_QUALITY'         // 数据质量
  | 'SYSTEM_RELIABILITY';  // 系统可靠性

/**
 * 改进指标
 */
export interface ImprovementMetric {
  /** 指标类型 */
  type: ImprovementMetricType;
  /** 指标名称 */
  name: string;
  /** 当前值 */
  currentValue: number; // 0-1
  /** 目标值 */
  targetValue: number; // 0-1
  /** 历史值（用于趋势分析） */
  history: Array<{
    timestamp: string;
    value: number;
  }>;
  /** 趋势 */
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  /** 改进空间 */
  improvementPotential: number; // 0-1
}

/**
 * 问题分析结果
 */
export interface ProblemAnalysis {
  /** 问题ID */
  problemId: string;
  /** 问题描述 */
  description: string;
  /** 问题严重程度 */
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  /** 影响的指标 */
  affectedMetrics: ImprovementMetricType[];
  /** 根本原因 */
  rootCauses: string[];
  /** 影响范围 */
  impact: string[];
  /** 发生频率 */
  frequency: number; // 0-1
}

/**
 * 改进方向
 */
export interface ImprovementDirection {
  /** 改进ID */
  improvementId: string;
  /** 改进名称 */
  name: string;
  /** 改进描述 */
  description: string;
  /** 针对的问题 */
  targetProblems: string[];
  /** 预期改进的指标 */
  expectedMetricImprovements: Record<ImprovementMetricType, number>; // 预期改进幅度
  /** 实施难度 */
  implementationDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 预期效果 */
  expectedEffect: string;
  /** 优先级 */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 改进实施记录
 */
export interface ImprovementImplementation {
  /** 实施ID */
  implementationId: string;
  /** 改进方向ID */
  improvementId: string;
  /** 实施开始时间 */
  startTime: string;
  /** 实施结束时间（如果已完成） */
  endTime?: string;
  /** 实施状态 */
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  /** 实施内容 */
  changes: string[];
  /** 实施人员/系统 */
  implementedBy: string;
}

/**
 * 改进验证结果
 */
export interface ImprovementValidation {
  /** 验证ID */
  validationId: string;
  /** 改进实施ID */
  implementationId: string;
  /** 验证时间 */
  validationTime: string;
  /** 验证方法 */
  validationMethod: 'A_B_TEST' | 'BEFORE_AFTER' | 'STATISTICAL' | 'USER_FEEDBACK';
  /** 指标改进情况 */
  metricImprovements: Record<ImprovementMetricType, {
    before: number;
    after: number;
    improvement: number;
    significant: boolean;
  }>;
  /** 验证结论 */
  conclusion: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'INCONCLUSIVE';
  /** 验证说明 */
  explanation: string;
  /** 建议 */
  recommendations: string[];
}

/**
 * 学习循环状态
 */
export interface LearningCycleState {
  /** 循环ID */
  cycleId: string;
  /** 当前阶段 */
  phase: 'COLLECT_FEEDBACK' | 'ANALYZE_PROBLEMS' | 'DETERMINE_DIRECTIONS' | 'IMPLEMENT' | 'VALIDATE';
  /** 开始时间 */
  startTime: string;
  /** 当前指标 */
  currentMetrics: Record<ImprovementMetricType, ImprovementMetric>;
  /** 发现的问题 */
  problems: ProblemAnalysis[];
  /** 确定的改进方向 */
  improvementDirections: ImprovementDirection[];
  /** 实施的改进 */
  implementations: ImprovementImplementation[];
  /** 验证结果 */
  validations: ImprovementValidation[];
}

/**
 * 持续改进循环结果
 */
export interface ContinuousImprovementResult {
  /** 循环状态 */
  cycleState: LearningCycleState;
  /** 总体改进情况 */
  overallImprovement: {
    averageMetricImprovement: number;
    improvedMetrics: ImprovementMetricType[];
    declinedMetrics: ImprovementMetricType[];
  };
  /** 下一步行动 */
  nextActions: string[];
  /** 改进报告 */
  improvementReport: string;
}
