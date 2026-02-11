// src/trips/decision/optimization/experiments/ab-testing.interface.ts
/**
 * A/B 测试框架接口
 * 
 * 中期功能：支持权重学习的实验验证
 * 
 * 核心能力：
 * 1. 实验配置和分组
 * 2. 指标收集和统计
 * 3. 显著性检验
 * 4. 自动停止（Early Stopping）
 */

import { ObjectiveFunctionWeights } from '../objective-function.interface';

/**
 * 实验状态
 */
export type ExperimentStatus = 
  | 'DRAFT'       // 草稿
  | 'RUNNING'     // 运行中
  | 'PAUSED'      // 暂停
  | 'COMPLETED'   // 完成
  | 'STOPPED';    // 提前停止

/**
 * 分组类型
 */
export type AllocationStrategy = 
  | 'RANDOM'          // 随机分配
  | 'STRATIFIED'      // 分层随机
  | 'DETERMINISTIC';  // 确定性（基于用户 ID）

/**
 * 实验变体
 */
export interface ExperimentVariant {
  /** 变体 ID */
  variantId: string;
  
  /** 变体名称 */
  name: string;
  
  /** 变体描述 */
  description: string;
  
  /** 是否是对照组 */
  isControl: boolean;
  
  /** 流量比例 (0-1) */
  trafficAllocation: number;
  
  /** 权重配置 */
  weights: ObjectiveFunctionWeights;
  
  /** 其他配置 */
  config?: Record<string, any>;
}

/**
 * 实验指标定义
 */
export interface MetricDefinition {
  /** 指标 ID */
  metricId: string;
  
  /** 指标名称 */
  name: string;
  
  /** 指标类型 */
  type: 'CONTINUOUS' | 'BINARY' | 'COUNT' | 'RATIO';
  
  /** 是否是主要指标 */
  isPrimary: boolean;
  
  /** 优化方向 */
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  
  /** 最小可检测效应 (MDE) */
  minimumDetectableEffect: number;
  
  /** 计算方式 */
  calculation: string;
}

/**
 * 实验配置
 */
export interface ExperimentConfig {
  /** 实验 ID */
  experimentId: string;
  
  /** 实验名称 */
  name: string;
  
  /** 实验描述 */
  description: string;
  
  /** 假设 */
  hypothesis: string;
  
  /** 实验状态 */
  status: ExperimentStatus;
  
  /** 变体列表 */
  variants: ExperimentVariant[];
  
  /** 指标列表 */
  metrics: MetricDefinition[];
  
  /** 分配策略 */
  allocationStrategy: AllocationStrategy;
  
  /** 目标样本量 */
  targetSampleSize: number;
  
  /** 显著性水平 */
  significanceLevel: number; // 通常 0.05
  
  /** 统计功效 */
  statisticalPower: number; // 通常 0.8
  
  /** 计划开始时间 */
  plannedStartDate: string;
  
  /** 计划结束时间 */
  plannedEndDate: string;
  
  /** 是否启用自动停止 */
  enableEarlyStopping: boolean;
  
  /** 早停阈值 */
  earlyStoppingThreshold?: number;
  
  /** 用户过滤条件 */
  userFilter?: {
    countries?: string[];
    fitnessLevels?: string[];
    experienceLevels?: string[];
    minTrips?: number;
  };
  
  /** 创建时间 */
  createdAt: string;
  
  /** 创建者 */
  createdBy: string;
}

/**
 * 用户分配结果
 */
export interface UserAllocation {
  /** 用户 ID */
  userId: string;
  
  /** 实验 ID */
  experimentId: string;
  
  /** 变体 ID */
  variantId: string;
  
  /** 分配时间 */
  allocatedAt: string;
  
  /** 分配方式 */
  allocationMethod: AllocationStrategy;
}

/**
 * 指标观测
 */
export interface MetricObservation {
  /** 观测 ID */
  observationId: string;
  
  /** 实验 ID */
  experimentId: string;
  
  /** 变体 ID */
  variantId: string;
  
  /** 用户 ID */
  userId: string;
  
  /** 指标 ID */
  metricId: string;
  
  /** 观测值 */
  value: number;
  
  /** 观测时间 */
  observedAt: string;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 变体统计
 */
export interface VariantStatistics {
  /** 变体 ID */
  variantId: string;
  
  /** 样本量 */
  sampleSize: number;
  
  /** 各指标统计 */
  metrics: {
    [metricId: string]: {
      mean: number;
      stdDev: number;
      median: number;
      min: number;
      max: number;
      count: number;
    };
  };
}

/**
 * 统计检验结果
 */
export interface StatisticalTestResult {
  /** 检验类型 */
  testType: 'T_TEST' | 'CHI_SQUARE' | 'MANN_WHITNEY' | 'BOOTSTRAP';
  
  /** p 值 */
  pValue: number;
  
  /** 是否显著 */
  isSignificant: boolean;
  
  /** 效应量 */
  effectSize: number;
  
  /** 置信区间 */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  
  /** 相对提升 */
  relativeUplift: number;
  
  /** 检验统计量 */
  testStatistic: number;
  
  /** 自由度 */
  degreesOfFreedom?: number;
}

/**
 * 实验分析结果
 */
export interface ExperimentAnalysis {
  /** 实验 ID */
  experimentId: string;
  
  /** 分析时间 */
  analyzedAt: string;
  
  /** 当前状态 */
  status: ExperimentStatus;
  
  /** 各变体统计 */
  variantStatistics: VariantStatistics[];
  
  /** 各指标的检验结果 */
  testResults: {
    [metricId: string]: {
      control: string;
      treatment: string;
      result: StatisticalTestResult;
    }[];
  };
  
  /** 推荐决策 */
  recommendation: 'CONTINUE' | 'STOP_WINNER' | 'STOP_NO_EFFECT' | 'INCONCLUSIVE';
  
  /** 推荐原因 */
  recommendationReason: string;
  
  /** 获胜变体（如果有） */
  winningVariant?: string;
  
  /** 预计完成时间 */
  estimatedCompletionDate?: string;
  
  /** 当前进度 */
  progress: {
    currentSampleSize: number;
    targetSampleSize: number;
    percentComplete: number;
  };
}

/**
 * A/B 测试服务接口
 */
export interface IABTestingService {
  /**
   * 创建实验
   */
  createExperiment(config: Omit<ExperimentConfig, 'experimentId' | 'createdAt'>): Promise<ExperimentConfig>;
  
  /**
   * 启动实验
   */
  startExperiment(experimentId: string): Promise<void>;
  
  /**
   * 暂停实验
   */
  pauseExperiment(experimentId: string): Promise<void>;
  
  /**
   * 停止实验
   */
  stopExperiment(experimentId: string, reason: string): Promise<void>;
  
  /**
   * 分配用户到变体
   */
  allocateUser(experimentId: string, userId: string): Promise<UserAllocation>;
  
  /**
   * 获取用户的变体
   */
  getUserVariant(experimentId: string, userId: string): Promise<ExperimentVariant | null>;
  
  /**
   * 记录指标观测
   */
  recordObservation(observation: Omit<MetricObservation, 'observationId' | 'observedAt'>): Promise<void>;
  
  /**
   * 分析实验
   */
  analyzeExperiment(experimentId: string): Promise<ExperimentAnalysis>;
  
  /**
   * 检查早停条件
   */
  checkEarlyStopping(experimentId: string): Promise<{
    shouldStop: boolean;
    reason?: string;
    winningVariant?: string;
  }>;
  
  /**
   * 获取实验列表
   */
  listExperiments(status?: ExperimentStatus): Promise<ExperimentConfig[]>;
  
  /**
   * 获取实验详情
   */
  getExperiment(experimentId: string): Promise<ExperimentConfig | null>;
}
