// src/trips/decision/optimization/probabilistic/probabilistic-world-model.interface.ts
/**
 * 概率世界模型接口
 * 
 * Phase 2 核心：将确定性世界模型升级为概率世界模型
 * 
 * 核心变化：
 * 1. PhysicalReality → 概率分布
 * 2. HumanCapability → 概率分布（含动态变化）
 * 3. 支持条件概率和贝叶斯更新
 */

import {
  GaussianDistribution,
  BetaDistribution,
  TruncatedNormalDistribution,
  CategoricalDistribution,
} from './distribution.interface';

/**
 * 天气概率模型
 * 
 * 从点估计升级：
 * - 旧版：windSpeedMs: 15
 * - 新版：windSpeed: Gaussian(μ=15, σ²=25)
 */
export interface ProbabilisticWeather {
  /** 风速分布 (m/s) */
  windSpeed: GaussianDistribution;
  
  /** 降水量分布 (mm) */
  precipitation: GaussianDistribution;
  
  /** 能见度分布 (m) */
  visibility: GaussianDistribution;
  
  /** 温度分布 (°C) */
  temperature: GaussianDistribution;
  
  /** 天气状态分布（晴/多云/雨/雪） */
  condition: CategoricalDistribution;
  
  /** 极端天气概率 */
  extremeEventProbability: number;
  
  /** 预测时间范围（小时） */
  forecastHorizon: number;
  
  /** 预测不确定性随时间增长率 */
  uncertaintyGrowthRate: number;
}

/**
 * 道路状态概率模型
 */
export interface ProbabilisticRoadStatus {
  /** 道路 ID */
  roadId: string;
  
  /** 道路名称 */
  roadName?: string;
  
  /** 状态分布 */
  status: CategoricalDistribution; // OPEN/CONDITIONAL/CLOSED
  
  /** 如果关闭，预计开放时间分布（小时） */
  expectedReopenTime?: GaussianDistribution;
  
  /** 路况质量分布 (0-1) */
  conditionQuality?: BetaDistribution;
  
  /** 影响因素 */
  influencingFactors?: {
    weather: number;  // 天气影响权重
    season: number;   // 季节影响权重
    traffic: number;  // 交通影响权重
  };
}

/**
 * 危险区域概率模型
 */
export interface ProbabilisticHazard {
  /** 危险类型 */
  type: string;
  
  /** 风险等级分布 */
  riskLevel: CategoricalDistribution; // LOW/MEDIUM/HIGH
  
  /** 发生概率 */
  occurrenceProbability: BetaDistribution;
  
  /** 如果发生，影响程度分布 (0-1) */
  impactSeverity: BetaDistribution;
  
  /** 持续时间分布（小时） */
  duration?: GaussianDistribution;
  
  /** 受影响区域半径（米） */
  affectedRadius?: GaussianDistribution;
}

/**
 * 渡轮/交通服务概率模型
 */
export interface ProbabilisticTransportService {
  /** 服务 ID */
  serviceId: string;
  
  /** 运营状态分布 */
  operationalStatus: CategoricalDistribution; // RUNNING/DELAYED/CANCELLED
  
  /** 延误时间分布（分钟） */
  delayMinutes: GaussianDistribution;
  
  /** 取消概率 */
  cancellationProbability: BetaDistribution;
  
  /** 可用性（座位/容量） */
  availabilityRate: BetaDistribution;
}

/**
 * 概率物理现实模型
 */
export interface ProbabilisticPhysicalReality {
  /** 当前月份 */
  month: number;
  
  /** 天气预测 */
  weather: ProbabilisticWeather;
  
  /** 道路状态 */
  roadStatuses: ProbabilisticRoadStatus[];
  
  /** 危险区域 */
  hazards: ProbabilisticHazard[];
  
  /** 交通服务 */
  transportServices: ProbabilisticTransportService[];
  
  /** 气候可达性分布 */
  climateAccessibility: BetaDistribution;
  
  /** 日照时间分布（小时） */
  daylightHours: GaussianDistribution;
}

/**
 * 人体能力概率模型
 * 
 * 核心变化：
 * - 旧版：maxDailyAscentM: 800
 * - 新版：fatigueThreshold: Gaussian(μ=800, σ²=14400)
 *         （均值 800，标准差 120）
 */
export interface ProbabilisticHumanCapability {
  // ========== 体能分布 ==========
  
  /** 最大单日爬升分布 (m) */
  maxDailyAscent: GaussianDistribution;
  
  /** 3天滚动爬升容忍分布 (m) */
  rollingAscent3Days: GaussianDistribution;
  
  /** 疲劳容忍度分布 (0-2) */
  fatigueThreshold: TruncatedNormalDistribution;
  
  /** 恢复速率分布 (每天恢复比例) */
  recoveryRate: BetaDistribution;
  
  // ========== 动态变化 ==========
  
  /** 连续行程天数影响系数 */
  cumulativeEffectCoefficient: number;
  
  /** 累积疲劳当前值 */
  currentCumulativeFatigue: number;
  
  /** 高海拔适应系数分布 */
  altitudeAdaptation?: BetaDistribution;
  
  // ========== 个人偏好分布 ==========
  
  /** 风险容忍度分布 */
  riskTolerance: CategoricalDistribution; // LOW/MEDIUM/HIGH
  
  /** 节奏偏好分布 */
  pacePreference: CategoricalDistribution; // SLOW/MODERATE/FAST
  
  // ========== 元信息 ==========
  
  /** 模型置信度 */
  modelConfidence: number;
  
  /** 校准历史（用于贝叶斯更新） */
  calibrationHistory?: Array<{
    date: string;
    actualPerformance: number;
    predictedPerformance: number;
  }>;
}

/**
 * 概率世界模型上下文
 */
export interface ProbabilisticWorldModelContext {
  /** 概率物理现实 */
  physical: ProbabilisticPhysicalReality;
  
  /** 概率人体能力 */
  human: ProbabilisticHumanCapability;
  
  /** 路线方向（哲学不变） */
  routeDirection: {
    id: string;
    name: string;
    philosophy?: any;
    constraints?: any;
  };
  
  /** 模型版本 */
  modelVersion: string;
  
  /** 最后更新时间 */
  lastUpdated: string;
}

/**
 * 世界状态采样结果
 */
export interface WorldStateSample {
  /** 采样 ID */
  sampleId: string;
  
  /** 采样的天气值 */
  weather: {
    windSpeedMs: number;
    precipitationMm: number;
    visibilityM: number;
    temperatureC: number;
    condition: string;
  };
  
  /** 采样的道路状态 */
  roadStatuses: Array<{
    roadId: string;
    status: 'OPEN' | 'CONDITIONAL' | 'CLOSED';
  }>;
  
  /** 采样的人体能力 */
  humanCapability: {
    maxDailyAscentM: number;
    fatigueThreshold: number;
    recoveryRate: number;
  };
  
  /** 采样的危险等级 */
  hazardLevels: Array<{
    type: string;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    occurred: boolean;
  }>;
  
  /** 综合可行性评分 */
  feasibilityScore: number;
}

/**
 * 条件概率查询
 */
export interface ConditionalProbabilityQuery {
  /** 目标变量 */
  target: string;
  
  /** 条件 */
  conditions: Array<{
    variable: string;
    operator: '=' | '>' | '<' | '>=' | '<=';
    value: number | string;
  }>;
}

/**
 * 概率世界模型服务接口
 */
export interface IProbabilisticWorldModelService {
  /**
   * 从确定性世界模型转换
   */
  fromDeterministicModel(
    deterministicContext: any,
    uncertaintyConfig?: UncertaintyConfig
  ): ProbabilisticWorldModelContext;
  
  /**
   * 采样世界状态
   */
  sampleWorldState(
    context: ProbabilisticWorldModelContext,
    n?: number
  ): WorldStateSample[];
  
  /**
   * 查询条件概率
   */
  queryConditionalProbability(
    context: ProbabilisticWorldModelContext,
    query: ConditionalProbabilityQuery
  ): number;
  
  /**
   * 贝叶斯更新（基于新观测）
   */
  updateWithObservation(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): ProbabilisticWorldModelContext;
  
  /**
   * 预测未来状态（时间推演）
   */
  predictFutureState(
    context: ProbabilisticWorldModelContext,
    hoursAhead: number
  ): ProbabilisticWorldModelContext;

  /**
   * 状态转移预测（专利升级点③）
   * NextState = WorldModel(State, Action)，概率形式 s_{t+1} ~ P_θ(s|s_t,a_t)
   * 用于决策模拟、可行性预判、多步规划
   * @param options.includeSamples 当 > 0 时，返回 nextStateSamples 作为分布采样
   */
  predictOutcome(
    context: ProbabilisticWorldModelContext,
    action: DecisionAction,
    options?: { includeSamples?: number }
  ): OutcomePrediction;
}

/** 决策动作（用于状态转移预测） */
export interface DecisionAction {
  type: string;
  payload?: Record<string, unknown>;
}

/** 结果预测 */
export interface OutcomePrediction {
  nextState: ProbabilisticWorldModelContext;
  feasibilityProbability: number;
  constraintViolations: string[];
  estimatedUtility: number;
  /**
   * Phase 2 研究级：s_{t+1} ~ P_θ(s|s_t,a_t) 的采样表示
   * 当需要分布而非点估计时，提供多组 nextState 采样
   */
  nextStateSamples?: WorldStateSample[];
}

/**
 * 不确定性配置
 */
export interface UncertaintyConfig {
  /** 天气不确定性系数 */
  weatherUncertainty: number;
  
  /** 道路状态不确定性 */
  roadStatusUncertainty: number;
  
  /** 人体能力不确定性 */
  humanCapabilityUncertainty: number;
  
  /** 默认置信度 */
  defaultConfidence: number;
}

/**
 * 世界状态观测（用于贝叶斯更新）
 */
export interface WorldStateObservation {
  /** 观测时间 */
  timestamp: string;
  
  /** 观测类型 */
  type: 'WEATHER' | 'ROAD' | 'HUMAN_PERFORMANCE' | 'HAZARD';
  
  /** 观测值 */
  observation: {
    variable: string;
    value: number | string;
  };
  
  /** 观测质量 */
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 默认不确定性配置
 */
export const DEFAULT_UNCERTAINTY_CONFIG: UncertaintyConfig = {
  weatherUncertainty: 0.25,
  roadStatusUncertainty: 0.15,
  humanCapabilityUncertainty: 0.15,
  defaultConfidence: 0.7,
};
