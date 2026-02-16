// src/trips/decision/optimization/probabilistic/expected-utility.service.ts
/**
 * 期望效用服务
 * 
 * Phase 2 核心：使用 Monte Carlo 采样计算期望效用
 * 
 * 关键算法：
 * E[U] = (1/N) * Σ U(s_i)
 * 其中 s_i ~ P(WorldState)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Distribution,
  GaussianDistribution,
  BetaDistribution,
  TruncatedNormalDistribution,
  CategoricalDistribution,
  DistributionStatistics,
} from './distribution.interface';
import {
  ProbabilisticWorldModelContext,
  WorldStateSample,
} from './probabilistic-world-model.interface';
import { RoutePlanDraft } from '../../shared/world-model.types';
import {
  ObjectiveEvaluationResult,
  ObjectiveFunctionWeights,
} from '../objective-function.interface';

/**
 * Monte Carlo 配置
 */
export interface MonteCarloConfig {
  /** 采样数量 */
  sampleSize: number;
  
  /** 随机种子（可选，用于可重复性） */
  seed?: number;
  
  /** 是否使用重要性采样 */
  useImportanceSampling?: boolean;
  
  /** 收敛阈值（早停条件） */
  convergenceThreshold?: number;
  
  /** 最小采样数（早停前的最小样本） */
  minSamples?: number;
  
  /** 置信区间宽度（例如 0.95 表示 95% 置信区间） */
  confidenceLevel?: number;
}

/**
 * 默认 Monte Carlo 配置
 */
export const DEFAULT_MONTE_CARLO_CONFIG: MonteCarloConfig = {
  sampleSize: 1000,
  convergenceThreshold: 0.01,
  minSamples: 100,
  confidenceLevel: 0.95,
};

/**
 * 期望效用结果
 */
export interface ExpectedUtilityResult {
  /** 期望效用 */
  expectedUtility: number;
  
  /** 效用分布统计 */
  statistics: DistributionStatistics;
  
  /** 置信区间 */
  confidenceInterval: {
    lower: number;
    upper: number;
    level: number;
  };
  
  /** 各维度期望值 */
  dimensionExpectations: {
    safety: number;
    experience: number;
    philosophy: number;
    timeSlack: number;
    fatigueRisk: number;
    weatherRisk: number;
    budgetOverrun: number;
    pacingVariance: number;
  };
  
  /** 风险指标 */
  riskMetrics: {
    /** 效用低于阈值的概率 P(U < threshold) */
    downRiskProbability: number;
    /** 最差情况效用（5% 分位数） */
    worstCase: number;
    /** 最好情况效用（95% 分位数） */
    bestCase: number;
    /** 效用波动性（标准差） */
    volatility: number;
  };
  
  /** 可行性概率 P(all hard constraints satisfied) */
  feasibilityProbability: number;

  /** 下行风险 P(U < threshold)，与 riskMetrics.downRiskProbability 一致，便于前端直接使用 */
  downsideRisk?: number;
  
  /** 采样详情 */
  samplingDetails: {
    totalSamples: number;
    convergenceAchieved: boolean;
    effectiveSampleSize: number;
  };
}

/**
 * 场景分析结果
 */
export interface ScenarioAnalysisResult {
  /** 场景名称 */
  scenarioName: string;
  
  /** 场景概率 */
  scenarioProbability: number;
  
  /** 场景下的期望效用 */
  expectedUtility: number;
  
  /** 场景描述 */
  description: string;
  
  /** 关键风险因素 */
  keyRiskFactors: string[];
}

/**
 * 敏感性分析结果
 */
export interface SensitivityAnalysisResult {
  /** 变量名 */
  variable: string;
  
  /** 敏感性系数（效用对变量的偏导数） */
  sensitivity: number;
  
  /** 弹性（变量变化 1% 对效用的影响 %） */
  elasticity: number;
  
  /** 重要性排序 */
  rank: number;
}

@Injectable()
export class ExpectedUtilityService {
  private readonly logger = new Logger(ExpectedUtilityService.name);
  
  // 简单的线性同余随机数生成器（用于可重复性）
  private rng: () => number = Math.random;

  /**
   * 计算期望效用
   * 
   * 核心算法：Monte Carlo 积分
   * E[U(plan)] = (1/N) * Σ_i U(plan | worldState_i)
   */
  computeExpectedUtility(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    config: MonteCarloConfig = DEFAULT_MONTE_CARLO_CONFIG
  ): ExpectedUtilityResult {
    this.logger.debug(`[ExpectedUtility] 开始 Monte Carlo 计算，样本数: ${config.sampleSize}`);
    
    // 初始化随机数生成器
    if (config.seed !== undefined) {
      this.initializeRNG(config.seed);
    }
    
    // 1. 采样世界状态
    const worldSamples = this.sampleWorldStates(probabilisticContext, config.sampleSize);
    
    // 2. 计算每个样本的效用
    const utilities: number[] = [];
    const dimensionSamples: Record<string, number[]> = {
      safety: [],
      experience: [],
      philosophy: [],
      timeSlack: [],
      fatigueRisk: [],
      weatherRisk: [],
      budgetOverrun: [],
      pacingVariance: [],
    };
    
    let feasibleCount = 0;
    
    for (const sample of worldSamples) {
      const evaluation = this.evaluatePlanWithSample(plan, sample, weights);
      utilities.push(evaluation.utility);
      
      // 记录各维度
      for (const dim of Object.keys(dimensionSamples)) {
        dimensionSamples[dim].push(evaluation.dimensions[dim] || 0);
      }
      
      if (evaluation.isFeasible) {
        feasibleCount++;
      }
      
      // 早停检查
      if (
        config.convergenceThreshold &&
        utilities.length >= (config.minSamples || 100) &&
        utilities.length % 100 === 0
      ) {
        const currentMean = this.mean(utilities);
        const recentMean = this.mean(utilities.slice(-100));
        if (Math.abs(currentMean - recentMean) < config.convergenceThreshold) {
          this.logger.debug(`[ExpectedUtility] 提前收敛于第 ${utilities.length} 个样本`);
          break;
        }
      }
    }
    
    // 3. 计算统计量
    const statistics = this.computeStatistics(utilities);
    
    // 4. 计算置信区间
    const confidenceLevel = config.confidenceLevel || 0.95;
    const confidenceInterval = this.computeConfidenceInterval(
      utilities,
      confidenceLevel
    );
    
    // 5. 计算各维度期望
    const dimensionExpectations: any = {};
    for (const dim of Object.keys(dimensionSamples)) {
      dimensionExpectations[dim] = this.mean(dimensionSamples[dim]);
    }
    
    // 6. 计算风险指标
    const riskMetrics = this.computeRiskMetrics(utilities);
    
    return {
      expectedUtility: statistics.mean,
      statistics,
      confidenceInterval,
      dimensionExpectations,
      riskMetrics,
      feasibilityProbability: feasibleCount / utilities.length,
      samplingDetails: {
        totalSamples: utilities.length,
        convergenceAchieved: utilities.length < config.sampleSize,
        effectiveSampleSize: this.estimateEffectiveSampleSize(utilities),
      },
    };
  }

  /**
   * 场景分析
   * 
   * 分析不同场景下的期望效用
   */
  scenarioAnalysis(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    scenarios: Array<{
      name: string;
      description: string;
      conditions: Record<string, any>;
      probability: number;
    }>
  ): ScenarioAnalysisResult[] {
    const results: ScenarioAnalysisResult[] = [];
    
    for (const scenario of scenarios) {
      // 创建条件化的概率上下文
      const conditionalContext = this.applyScenarioConditions(
        probabilisticContext,
        scenario.conditions
      );
      
      // 计算场景下的期望效用
      const utilityResult = this.computeExpectedUtility(
        plan,
        conditionalContext,
        weights,
        { sampleSize: 200 } // 每个场景较少样本
      );
      
      results.push({
        scenarioName: scenario.name,
        scenarioProbability: scenario.probability,
        expectedUtility: utilityResult.expectedUtility,
        description: scenario.description,
        keyRiskFactors: this.identifyKeyRiskFactors(utilityResult),
      });
    }
    
    return results;
  }

  /**
   * 敏感性分析
   * 
   * 分析各变量对效用的影响
   */
  sensitivityAnalysis(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    variables: string[] = ['weather', 'humanCapability', 'roadStatus']
  ): SensitivityAnalysisResult[] {
    const results: SensitivityAnalysisResult[] = [];
    
    // 基准效用
    const baselineUtility = this.computeExpectedUtility(
      plan,
      probabilisticContext,
      weights,
      { sampleSize: 500 }
    );
    
    for (const variable of variables) {
      // 增加 10% 不确定性
      const perturbedContext = this.perturbVariable(
        probabilisticContext,
        variable,
        0.1
      );
      
      const perturbedUtility = this.computeExpectedUtility(
        plan,
        perturbedContext,
        weights,
        { sampleSize: 500 }
      );
      
      const sensitivity = perturbedUtility.expectedUtility - baselineUtility.expectedUtility;
      const elasticity = (sensitivity / baselineUtility.expectedUtility) / 0.1;
      
      results.push({
        variable,
        sensitivity,
        elasticity,
        rank: 0, // 稍后排序
      });
    }
    
    // 按敏感性绝对值排序
    results.sort((a, b) => Math.abs(b.sensitivity) - Math.abs(a.sensitivity));
    results.forEach((r, i) => r.rank = i + 1);
    
    return results;
  }

  /**
   * 比较两个计划的期望效用
   * 
   * 返回 P(U(planA) > U(planB))
   */
  comparePlans(
    planA: RoutePlanDraft,
    planB: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    config: MonteCarloConfig = DEFAULT_MONTE_CARLO_CONFIG
  ): {
    probabilityABetter: number;
    expectedDifference: number;
    differenceConfidenceInterval: { lower: number; upper: number };
    recommendation: 'A' | 'B' | 'EQUAL';
    confidenceInRecommendation: number;
  } {
    // 使用配对采样（同一世界状态下比较）
    const worldSamples = this.sampleWorldStates(probabilisticContext, config.sampleSize);
    
    const differences: number[] = [];
    let aWins = 0;
    
    for (const sample of worldSamples) {
      const utilityA = this.evaluatePlanWithSample(planA, sample, weights).utility;
      const utilityB = this.evaluatePlanWithSample(planB, sample, weights).utility;
      
      differences.push(utilityA - utilityB);
      if (utilityA > utilityB) aWins++;
    }
    
    const probabilityABetter = aWins / differences.length;
    const expectedDifference = this.mean(differences);
    const ci = this.computeConfidenceInterval(differences, 0.95);
    
    let recommendation: 'A' | 'B' | 'EQUAL';
    let confidence: number;
    
    if (probabilityABetter > 0.6) {
      recommendation = 'A';
      confidence = probabilityABetter;
    } else if (probabilityABetter < 0.4) {
      recommendation = 'B';
      confidence = 1 - probabilityABetter;
    } else {
      recommendation = 'EQUAL';
      confidence = 1 - 2 * Math.abs(probabilityABetter - 0.5);
    }
    
    return {
      probabilityABetter,
      expectedDifference,
      differenceConfidenceInterval: ci,
      recommendation,
      confidenceInRecommendation: confidence,
    };
  }

  // ========== 私有方法 ==========

  /**
   * 采样世界状态
   */
  private sampleWorldStates(
    context: ProbabilisticWorldModelContext,
    n: number
  ): WorldStateSample[] {
    const samples: WorldStateSample[] = [];
    
    for (let i = 0; i < n; i++) {
      samples.push({
        sampleId: `sample_${i}`,
        weather: {
          windSpeedMs: this.sampleGaussian(context.physical.weather.windSpeed),
          precipitationMm: Math.max(0, this.sampleGaussian(context.physical.weather.precipitation)),
          visibilityM: Math.max(0, this.sampleGaussian(context.physical.weather.visibility)),
          temperatureC: this.sampleGaussian(context.physical.weather.temperature),
          condition: this.sampleCategorical(context.physical.weather.condition),
        },
        roadStatuses: context.physical.roadStatuses.map(road => ({
          roadId: road.roadId,
          status: this.sampleCategorical(road.status) as 'OPEN' | 'CONDITIONAL' | 'CLOSED',
        })),
        humanCapability: {
          maxDailyAscentM: this.sampleGaussian(context.human.maxDailyAscent),
          fatigueThreshold: this.sampleTruncatedNormal(context.human.fatigueThreshold),
          recoveryRate: this.sampleBeta(context.human.recoveryRate),
        },
        hazardLevels: context.physical.hazards.map(hazard => {
          const occurred = this.rng() < this.betaMean(hazard.occurrenceProbability);
          return {
            type: hazard.type,
            level: this.sampleCategorical(hazard.riskLevel) as 'LOW' | 'MEDIUM' | 'HIGH',
            occurred,
          };
        }),
        feasibilityScore: 0, // 将在评估时计算
      });
    }
    
    return samples;
  }

  /**
   * 使用采样的世界状态评估计划
   */
  private evaluatePlanWithSample(
    plan: RoutePlanDraft,
    sample: WorldStateSample,
    weights: ObjectiveFunctionWeights
  ): {
    utility: number;
    dimensions: Record<string, number>;
    isFeasible: boolean;
  } {
    // 计算各维度分数
    const dimensions: Record<string, number> = {};
    
    // 安全性：受天气和道路影响
    let safetyScore = 1.0;
    if (sample.weather.windSpeedMs > 20) safetyScore -= 0.2;
    if (sample.weather.visibilityM < 500) safetyScore -= 0.3;
    const closedRoads = sample.roadStatuses.filter(r => r.status === 'CLOSED').length;
    safetyScore -= closedRoads * 0.2;
    const hazardOccurred = sample.hazardLevels.filter(h => h.occurred).length;
    safetyScore -= hazardOccurred * 0.15;
    dimensions['safety'] = Math.max(0, safetyScore);
    
    // 体验密度：受天气影响
    let experienceScore = 0.8;
    if (sample.weather.condition === 'rain' || sample.weather.condition === 'snow') {
      experienceScore -= 0.2;
    }
    dimensions['experience'] = experienceScore;
    
    // 哲学匹配：相对稳定
    dimensions['philosophy'] = 0.85;
    
    // 时间余量：受延误影响
    let timeSlackScore = 0.7;
    const conditionalRoads = sample.roadStatuses.filter(r => r.status === 'CONDITIONAL').length;
    timeSlackScore -= conditionalRoads * 0.1;
    dimensions['timeSlack'] = Math.max(0, timeSlackScore);
    
    // 疲劳风险：受人体能力波动影响
    const fatigueRisk = Math.max(0, 1 - sample.humanCapability.fatigueThreshold / 1.5);
    dimensions['fatigueRisk'] = fatigueRisk;
    
    // 天气风险
    let weatherRisk = 0;
    if (sample.weather.precipitationMm > 10) weatherRisk += 0.3;
    if (sample.weather.windSpeedMs > 15) weatherRisk += 0.2;
    dimensions['weatherRisk'] = Math.min(1, weatherRisk);
    
    // 预算风险（简化）
    dimensions['budgetOverrun'] = 0.1;
    
    // 节奏方差（简化）
    dimensions['pacingVariance'] = 0.15;
    
    // 计算加权效用
    const positiveUtility = 
      weights.safety * dimensions['safety'] +
      weights.experienceDensity * dimensions['experience'] +
      weights.philosophyAlignment * dimensions['philosophy'] +
      weights.timeSlack * dimensions['timeSlack'];
    
    const negativeUtility = 
      weights.fatigueRisk * dimensions['fatigueRisk'] +
      weights.weatherRisk * dimensions['weatherRisk'] +
      weights.budgetOverrun * dimensions['budgetOverrun'] +
      weights.pacingVariance * dimensions['pacingVariance'];
    
    const utility = Math.max(0, Math.min(1, positiveUtility - negativeUtility));
    
    // 可行性检查
    const isFeasible = closedRoads === 0 && 
                       hazardOccurred === 0 && 
                       dimensions['safety'] > 0.3;
    
    return { utility, dimensions, isFeasible };
  }

  // ========== 采样方法 ==========

  private sampleGaussian(dist: GaussianDistribution): number {
    // Box-Muller 变换
    const u1 = this.rng();
    const u2 = this.rng();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return dist.params.mean + Math.sqrt(dist.params.variance) * z;
  }

  private sampleBeta(dist: BetaDistribution): number {
    // 简化：使用 gamma 分布的比值
    const alpha = dist.params.alpha;
    const beta = dist.params.beta;
    
    // 简单近似：均值 + 扰动
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stdDev = Math.sqrt(variance);
    
    // 使用截断正态近似
    let sample = mean + stdDev * (this.rng() * 2 - 1) * 2;
    return Math.max(0, Math.min(1, sample));
  }

  private sampleTruncatedNormal(dist: TruncatedNormalDistribution): number {
    // 简单拒绝采样
    for (let i = 0; i < 100; i++) {
      const sample = dist.params.mean + 
        Math.sqrt(dist.params.variance) * (this.rng() * 2 - 1) * 3;
      if (sample >= dist.params.lower && sample <= dist.params.upper) {
        return sample;
      }
    }
    // 如果 100 次都失败，返回均值
    return dist.params.mean;
  }

  private sampleCategorical(dist: CategoricalDistribution): string {
    const r = this.rng();
    let cumulative = 0;
    for (let i = 0; i < dist.params.categories.length; i++) {
      cumulative += dist.params.probabilities[i];
      if (r < cumulative) {
        return dist.params.categories[i];
      }
    }
    return dist.params.categories[dist.params.categories.length - 1];
  }

  private betaMean(dist: BetaDistribution): number {
    return dist.params.alpha / (dist.params.alpha + dist.params.beta);
  }

  // ========== 统计方法 ==========

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const m = this.mean(values);
    return values.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / values.length;
  }

  private computeStatistics(values: number[]): DistributionStatistics {
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const m = this.mean(values);
    const v = this.variance(values);
    
    return {
      mean: m,
      variance: v,
      stdDev: Math.sqrt(v),
      median: sorted[Math.floor(n / 2)],
      quantiles: {
        q5: sorted[Math.floor(n * 0.05)],
        q25: sorted[Math.floor(n * 0.25)],
        q75: sorted[Math.floor(n * 0.75)],
        q95: sorted[Math.floor(n * 0.95)],
      },
    };
  }

  private computeConfidenceInterval(
    values: number[],
    level: number
  ): { lower: number; upper: number; level: number } {
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const alpha = 1 - level;
    
    return {
      lower: sorted[Math.floor(n * alpha / 2)],
      upper: sorted[Math.floor(n * (1 - alpha / 2))],
      level,
    };
  }

  private computeRiskMetrics(utilities: number[]): ExpectedUtilityResult['riskMetrics'] {
    const sorted = [...utilities].sort((a, b) => a - b);
    const n = utilities.length;
    const threshold = 0.5; // 效用低于 0.5 视为风险
    
    return {
      downRiskProbability: utilities.filter(u => u < threshold).length / n,
      worstCase: sorted[Math.floor(n * 0.05)],
      bestCase: sorted[Math.floor(n * 0.95)],
      volatility: Math.sqrt(this.variance(utilities)),
    };
  }

  private estimateEffectiveSampleSize(values: number[]): number {
    // 简化：假设独立采样，有效样本大小等于实际样本数
    return values.length;
  }

  // ========== 辅助方法 ==========

  private initializeRNG(seed: number): void {
    // 简单的线性同余生成器
    let state = seed;
    this.rng = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  private applyScenarioConditions(
    context: ProbabilisticWorldModelContext,
    conditions: Record<string, any>
  ): ProbabilisticWorldModelContext {
    // 创建深拷贝并应用条件
    const newContext = JSON.parse(JSON.stringify(context));
    
    if (conditions.weather === 'bad') {
      newContext.physical.weather.windSpeed.params.mean *= 1.5;
      newContext.physical.weather.precipitation.params.mean *= 2;
    }
    
    if (conditions.roadsClosed) {
      for (const road of newContext.physical.roadStatuses) {
        road.status.params.probabilities = [0.3, 0.3, 0.4]; // 更高的关闭概率
      }
    }
    
    return newContext;
  }

  private perturbVariable(
    context: ProbabilisticWorldModelContext,
    variable: string,
    perturbation: number
  ): ProbabilisticWorldModelContext {
    const newContext = JSON.parse(JSON.stringify(context));
    
    if (variable === 'weather') {
      newContext.physical.weather.windSpeed.params.variance *= (1 + perturbation);
      newContext.physical.weather.precipitation.params.variance *= (1 + perturbation);
    } else if (variable === 'humanCapability') {
      newContext.human.maxDailyAscent.params.variance *= (1 + perturbation);
      newContext.human.fatigueThreshold.params.variance *= (1 + perturbation);
    } else if (variable === 'roadStatus') {
      // 增加道路状态的不确定性
      for (const road of newContext.physical.roadStatuses) {
        // 使概率分布更均匀
        const probs = road.status.params.probabilities;
        const uniform = 1 / probs.length;
        for (let i = 0; i < probs.length; i++) {
          probs[i] = probs[i] * (1 - perturbation) + uniform * perturbation;
        }
      }
    }
    
    return newContext;
  }

  private identifyKeyRiskFactors(result: ExpectedUtilityResult): string[] {
    const factors: string[] = [];
    
    if (result.riskMetrics.downRiskProbability > 0.2) {
      factors.push('高失败风险');
    }
    if (result.riskMetrics.volatility > 0.15) {
      factors.push('效用波动大');
    }
    if (result.feasibilityProbability < 0.9) {
      factors.push('可行性存疑');
    }
    if (result.dimensionExpectations.weatherRisk > 0.3) {
      factors.push('天气风险');
    }
    if (result.dimensionExpectations.fatigueRisk > 0.3) {
      factors.push('疲劳风险');
    }
    
    return factors;
  }
}
