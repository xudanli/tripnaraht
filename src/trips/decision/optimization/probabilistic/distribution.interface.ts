// src/trips/decision/optimization/probabilistic/distribution.interface.ts
/**
 * 概率分布接口定义
 * 
 * Phase 2 核心：将点估计升级为概率分布
 * 
 * 设计原则：
 * 1. 物理现实 = 概率分布（天气、道路、危险）
 * 2. 人体能力 = 概率分布（疲劳容忍度、恢复速率）
 * 3. 所有决策都基于期望效用最大化
 */

/**
 * 分布类型
 */
export type DistributionType =
  | 'GAUSSIAN'        // 正态分布：适用于连续变量（温度、风速）
  | 'BETA'            // Beta 分布：适用于概率值（成功率、可达性）
  | 'TRUNCATED_NORMAL' // 截断正态：有界连续变量（疲劳指数 0-2）
  | 'POISSON'         // 泊松分布：离散事件（延误次数）
  | 'EXPONENTIAL'     // 指数分布：等待时间（渡轮延误）
  | 'UNIFORM'         // 均匀分布：无先验知识时的默认
  | 'CATEGORICAL'     // 分类分布：离散状态（道路状态）
  | 'MIXTURE';        // 混合分布：多模态情况

/**
 * 基础分布接口
 */
export interface Distribution {
  /** 分布类型 */
  type: DistributionType;
  
  /** 分布参数（不同分布类型有不同参数结构） */
  params: Record<string, any>;
  
  /** 置信度（数据质量） */
  confidence: number;
  
  /** 数据来源 */
  source?: string;
  
  /** 最后更新时间 */
  lastUpdated?: string;
}

/**
 * 高斯分布（正态分布）
 */
export interface GaussianDistribution extends Distribution {
  type: 'GAUSSIAN';
  params: {
    mean: number;      // μ: 均值
    variance: number;  // σ²: 方差
  };
}

/**
 * Beta 分布
 * 
 * 适用于概率建模（0-1 范围）
 * 例如：可达性概率、成功率
 */
export interface BetaDistribution extends Distribution {
  type: 'BETA';
  params: {
    alpha: number;  // α: 形状参数（成功次数 + 1）
    beta: number;   // β: 形状参数（失败次数 + 1）
  };
}

/**
 * 截断正态分布
 * 
 * 适用于有界连续变量
 * 例如：疲劳指数（0-2）、满意度（0-1）
 */
export interface TruncatedNormalDistribution extends Distribution {
  type: 'TRUNCATED_NORMAL';
  params: {
    mean: number;
    variance: number;
    lower: number;  // 下界
    upper: number;  // 上界
  };
}

/**
 * 泊松分布
 * 
 * 适用于计数数据
 * 例如：每日延误次数、事故数
 */
export interface PoissonDistribution extends Distribution {
  type: 'POISSON';
  params: {
    lambda: number; // λ: 平均发生率
  };
}

/**
 * 指数分布
 * 
 * 适用于等待时间建模
 * 例如：渡轮延误时间、道路封闭持续时间
 */
export interface ExponentialDistribution extends Distribution {
  type: 'EXPONENTIAL';
  params: {
    rate: number;  // λ: 速率参数（1/平均等待时间）
  };
}

/**
 * 均匀分布
 * 
 * 无先验知识时的默认分布
 */
export interface UniformDistribution extends Distribution {
  type: 'UNIFORM';
  params: {
    lower: number;
    upper: number;
  };
}

/**
 * 分类分布
 * 
 * 适用于离散状态
 * 例如：道路状态（OPEN/CONDITIONAL/CLOSED）
 */
export interface CategoricalDistribution extends Distribution {
  type: 'CATEGORICAL';
  params: {
    categories: string[];
    probabilities: number[]; // 各类别概率，和为 1
  };
}

/**
 * 混合分布
 * 
 * 适用于多模态情况
 * 例如：天气（晴天模式 + 雨天模式）
 */
export interface MixtureDistribution extends Distribution {
  type: 'MIXTURE';
  params: {
    weights: number[];        // 各组件权重，和为 1
    components: Distribution[]; // 各组件分布
  };
}

/**
 * 分布统计量
 */
export interface DistributionStatistics {
  /** 均值 */
  mean: number;
  
  /** 方差 */
  variance: number;
  
  /** 标准差 */
  stdDev: number;
  
  /** 众数 */
  mode?: number;
  
  /** 中位数 */
  median?: number;
  
  /** 分位数 */
  quantiles?: {
    q5: number;   // 5% 分位数
    q25: number;  // 25% 分位数
    q75: number;  // 75% 分位数
    q95: number;  // 95% 分位数
  };
  
  /** 偏度 */
  skewness?: number;
  
  /** 峰度 */
  kurtosis?: number;
}

/**
 * 采样结果
 */
export interface SampleResult {
  /** 采样值 */
  values: number[];
  
  /** 样本数 */
  sampleSize: number;
  
  /** 统计量 */
  statistics: DistributionStatistics;
}

/**
 * 条件分布
 * 
 * P(X | Y = y)
 */
export interface ConditionalDistribution {
  /** 目标变量 */
  target: string;
  
  /** 条件变量 */
  condition: {
    variable: string;
    value: number | string;
  };
  
  /** 条件分布 */
  distribution: Distribution;
}

/**
 * 联合分布
 * 
 * P(X, Y)
 */
export interface JointDistribution {
  /** 变量名 */
  variables: string[];
  
  /** 相关系数矩阵 */
  correlationMatrix?: number[][];
  
  /** 边缘分布 */
  marginals: Record<string, Distribution>;
  
  /** 协方差矩阵（如果是多元正态） */
  covarianceMatrix?: number[][];
}

/**
 * 分布运算类型
 */
export type DistributionOperation =
  | 'ADD'         // X + Y
  | 'SUBTRACT'    // X - Y
  | 'MULTIPLY'    // X * Y
  | 'DIVIDE'      // X / Y
  | 'MAX'         // max(X, Y)
  | 'MIN'         // min(X, Y)
  | 'SCALE'       // a * X
  | 'SHIFT';      // X + a

/**
 * 分布服务接口
 */
export interface IDistributionService {
  /**
   * 从分布中采样
   */
  sample(distribution: Distribution, n: number): number[];
  
  /**
   * 计算分布统计量
   */
  computeStatistics(distribution: Distribution): DistributionStatistics;
  
  /**
   * 计算概率密度/质量函数
   */
  pdf(distribution: Distribution, x: number): number;
  
  /**
   * 计算累积分布函数
   */
  cdf(distribution: Distribution, x: number): number;
  
  /**
   * 计算分位数函数（逆 CDF）
   */
  quantile(distribution: Distribution, p: number): number;
  
  /**
   * 分布运算
   */
  operate(
    op: DistributionOperation,
    dist1: Distribution,
    dist2OrScalar: Distribution | number
  ): Distribution;
  
  /**
   * 贝叶斯更新
   */
  bayesianUpdate(
    prior: Distribution,
    likelihood: Distribution,
    observation: number
  ): Distribution;
  
  /**
   * 从数据拟合分布
   */
  fitDistribution(
    data: number[],
    distributionType: DistributionType
  ): Distribution;
}

/**
 * 创建分布的工厂函数
 */
export function createGaussian(mean: number, variance: number, confidence = 0.8): GaussianDistribution {
  return {
    type: 'GAUSSIAN',
    params: { mean, variance },
    confidence,
  };
}

export function createBeta(alpha: number, beta: number, confidence = 0.8): BetaDistribution {
  return {
    type: 'BETA',
    params: { alpha, beta },
    confidence,
  };
}

export function createTruncatedNormal(
  mean: number,
  variance: number,
  lower: number,
  upper: number,
  confidence = 0.8
): TruncatedNormalDistribution {
  return {
    type: 'TRUNCATED_NORMAL',
    params: { mean, variance, lower, upper },
    confidence,
  };
}

export function createCategorical(
  categories: string[],
  probabilities: number[],
  confidence = 0.8
): CategoricalDistribution {
  return {
    type: 'CATEGORICAL',
    params: { categories, probabilities },
    confidence,
  };
}

/**
 * 从点估计创建分布
 * 
 * 用于迁移：将现有点估计升级为概率分布
 */
export function fromPointEstimate(
  value: number,
  uncertaintyPct: number = 0.2, // 默认 20% 不确定性
  bounded?: { lower: number; upper: number }
): Distribution {
  const variance = Math.pow(value * uncertaintyPct, 2);
  
  if (bounded) {
    return createTruncatedNormal(value, variance, bounded.lower, bounded.upper);
  }
  
  return createGaussian(value, variance);
}

/**
 * 从概率点估计创建 Beta 分布
 * 
 * @param probability 概率值 (0-1)
 * @param sampleSize 等效样本量（越大方差越小）
 */
export function fromProbabilityEstimate(
  probability: number,
  sampleSize: number = 10
): BetaDistribution {
  // Beta 分布参数：α = p * n, β = (1-p) * n
  const alpha = probability * sampleSize + 1;
  const beta = (1 - probability) * sampleSize + 1;
  
  return createBeta(alpha, beta, Math.min(0.9, sampleSize / 100));
}
