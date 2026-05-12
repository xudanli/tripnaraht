// src/trips/decision/optimization/probabilistic/expected-utility.service.ts
/**
 * 期望效用服务
 *
 * Phase 2 核心：使用 Monte Carlo 采样计算期望效用
 *
 * 研究级表述（专利 3.3.1）：
 * U(a|b) = E_s∼b[R(s,a)] − λC(a) − γRisk(s,a) + δP(a)
 *
 * 本服务实现 E_s∼b[R(s,a)] 部分：
 * E_s∼b[R(s,a)] ≈ (1/N) * Σ_i R(s_i, a)，其中 s_i ~ b(s) = P(s|observations)
 * 通过 sampleWorldState 从 ProbabilisticWorldModelContext 采样 s_i，近似信念状态 b(s)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
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
import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';
import type { RoadState, HazardZoneState } from '../../models/physical-reality.model';
import { ObjectiveFunctionService } from '../objective-function.service';
import { ObjectiveFunctionWeights, type ObjectiveEvaluationResult } from '../objective-function.interface';
import { PlanFeaturesService, type PlanFeatures } from '../plan-features/plan-features.service';
import { ExposureMapService, type ExposureMap } from '../plan-features/exposure-map.service';

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

  /**
   * 若提供，则每个样本在「该确定性世界 + 样本扰动」下调用
   * `ObjectiveFunctionService.evaluate`，维度与 `POST .../evaluate` / risk-assessment 的确定性口径一致；
   * 总效用仍用本方法入参 `weights` 做加权（避免与 `ObjectiveFunctionService` 内部可变权重漂移）。
   */
  deterministicWorld?: WorldModelContext;
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

// ========== P1.3 优化：自适应采样预算 ==========

/**
 * 自适应采样配置
 */
export interface AdaptiveSamplingConfig {
  minSamples: number;
  maxSamples: number;
  targetVarianceCoef: number;
  convergenceThreshold: number;
  checkInterval: number;
  earlyStopPatience: number;
  /** 与 `MonteCarloConfig.deterministicWorld` 相同语义（自适应 MC 对齐确定性目标函数） */
  deterministicWorld?: WorldModelContext;
}

export const DEFAULT_ADAPTIVE_CONFIG: AdaptiveSamplingConfig = {
  minSamples: 50,
  maxSamples: 5000,
  targetVarianceCoef: 0.05,
  convergenceThreshold: 0.01,
  checkInterval: 50,
  earlyStopPatience: 3,
};

/**
 * 自适应采样结果
 */
export interface AdaptiveSamplingResult {
  finalSampleSize: number;
  estimatedOptimalSize: number;
  converged: boolean;
  varianceHistory: number[];
  convergenceReason: 'variance_target' | 'convergence' | 'max_samples' | 'early_stop';
  efficiencyGain: number;
}

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

/**
 * 重要性采样配置
 * 
 * 专利实现：通过提议分布 q(s) 采样降低方差
 */
export interface ImportanceSamplingConfig extends MonteCarloConfig {
  /** 提议分布类型 */
  proposalType: 'SHIFTED_MEAN' | 'WIDENED_VARIANCE' | 'MIXTURE';
  /** 提议分布偏移因子（用于 SHIFTED_MEAN） */
  shiftFactor?: number;
  /** 方差扩展因子（用于 WIDENED_VARIANCE） */
  varianceExpansion?: number;
  /** 最大权重截断比例 */
  maxWeightRatio?: number;
}

/**
 * 重要性采样结果
 */
export interface ImportanceSamplingResult {
  /** 加权期望效用 */
  weightedMean: number;
  /** 有效样本数 ESS = 1 / Σ w_i² */
  effectiveSampleSize: number;
  /** 原始权重 */
  weights: number[];
  /** 归一化权重 */
  normalizedWeights: number[];
  /** 方差减少比例 */
  varianceReductionRatio: number;
  /** 诊断信息 */
  diagnostics: {
    maxWeight: number;
    minWeight: number;
    weightVariance: number;
    weightEntropy: number;
  };
}

@Injectable()
export class ExpectedUtilityService {
  private readonly logger = new Logger(ExpectedUtilityService.name);
  
  // 简单的线性同余随机数生成器（用于可重复性）
  private rng: () => number = Math.random;
  constructor(
    private readonly planFeatures: PlanFeaturesService,
    private readonly exposureMap: ExposureMapService,
    private readonly objectiveFunction: ObjectiveFunctionService,
  ) {}

  /**
   * 计算期望效用 E_s∼b[R(s,a)]
   *
   * 核心算法：Monte Carlo 积分，近似信念状态 b(s) 下的期望
   * E[U(plan)] = (1/N) * Σ_i U(plan | worldState_i)，其中 worldState_i ~ b(s)
   */
  computeExpectedUtility(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    config: MonteCarloConfig = DEFAULT_MONTE_CARLO_CONFIG
  ): ExpectedUtilityResult {
    if (['1', 'true', 'yes'].includes(String(process.env.DECISION_OS_VERBOSE_OPTIMIZATION ?? '').toLowerCase())) {
      this.logger.debug(`[ExpectedUtility] 开始 Monte Carlo 计算，样本数: ${config.sampleSize}`);
    }

    const features = this.planFeatures.extract(plan);
    const exposure = this.exposureMap.extract(plan);
    
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
      const evaluation = this.evaluateOneSample(
        plan,
        features,
        exposure,
        sample,
        weights,
        config.deterministicWorld,
      );
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
   * P1.3 优化：使用自适应采样计算期望效用
   *
   * 根据采样方差动态调整采样数量，在精度和效率之间取得平衡
   * 算法：基于 CLT，当 σ/√N < ε 时停止
   */
  computeExpectedUtilityAdaptive(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    adaptiveConfig: Partial<AdaptiveSamplingConfig> = {},
  ): ExpectedUtilityResult & { adaptiveSampling: AdaptiveSamplingResult } {
    const config = { ...DEFAULT_ADAPTIVE_CONFIG, ...adaptiveConfig };
    this.logger.debug(`[ExpectedUtility] 启用自适应采样，范围: ${config.minSamples}-${config.maxSamples}`);

    const features = this.planFeatures.extract(plan);
    const exposure = this.exposureMap.extract(plan);

    const utilities: number[] = [];
    const varianceHistory: number[] = [];
    const dimensionSamples: Record<string, number[]> = {
      safety: [], experience: [], philosophy: [], timeSlack: [],
      fatigueRisk: [], weatherRisk: [], budgetOverrun: [], pacingVariance: [],
    };
    let feasibleCount = 0;
    let converged = false;
    let convergenceReason: AdaptiveSamplingResult['convergenceReason'] = 'max_samples';
    let noImprovementCount = 0;

    while (utilities.length < config.maxSamples) {
      const batchSize = Math.min(config.checkInterval, config.maxSamples - utilities.length);
      const worldSamples = this.sampleWorldStates(probabilisticContext, batchSize);

      for (const sample of worldSamples) {
        const evaluation = this.evaluateOneSample(
          plan,
          features,
          exposure,
          sample,
          weights,
          config.deterministicWorld,
        );
        utilities.push(evaluation.utility);

        for (const dim of Object.keys(dimensionSamples)) {
          dimensionSamples[dim].push(evaluation.dimensions[dim] || 0);
        }

        if (evaluation.isFeasible) {
          feasibleCount++;
        }
      }

      if (utilities.length >= config.minSamples) {
        const currentMean = this.mean(utilities);
        const currentVariance = this.variance(utilities);
        const standardError = Math.sqrt(currentVariance / utilities.length);
        const coeffOfVariation = currentMean !== 0 ? standardError / Math.abs(currentMean) : Infinity;

        varianceHistory.push(currentVariance);

        if (coeffOfVariation <= config.targetVarianceCoef) {
          converged = true;
          convergenceReason = 'variance_target';
          this.logger.debug(
            `[ExpectedUtility] 方差目标达成，CV=${coeffOfVariation.toFixed(4)}, N=${utilities.length}`,
          );
          break;
        }

        if (varianceHistory.length >= 2) {
          const prevVariance = varianceHistory[varianceHistory.length - 2];
          const varianceChange = Math.abs(currentVariance - prevVariance) / (prevVariance || 1);

          if (varianceChange < config.convergenceThreshold) {
            noImprovementCount++;
            if (noImprovementCount >= config.earlyStopPatience) {
              converged = true;
              convergenceReason = 'early_stop';
              this.logger.debug(
                `[ExpectedUtility] 提前停止（方差稳定），N=${utilities.length}`,
              );
              break;
            }
          } else {
            noImprovementCount = 0;
          }
        }
      }
    }

    const statistics = this.computeStatistics(utilities);
    const confidenceInterval = this.computeConfidenceInterval(utilities, 0.95);

    const dimensionExpectations: any = {};
    for (const dim of Object.keys(dimensionSamples)) {
      dimensionExpectations[dim] = this.mean(dimensionSamples[dim]);
    }

    const riskMetrics = this.computeRiskMetrics(utilities);
    const currentVariance = this.variance(utilities);
    const estimatedOptimalSize = Math.ceil(
      (currentVariance / Math.pow(config.targetVarianceCoef * statistics.mean || 0.01, 2)) || config.minSamples,
    );

    const efficiencyGain = config.maxSamples > 0
      ? (config.maxSamples - utilities.length) / config.maxSamples
      : 0;

    const adaptiveSamplingResult: AdaptiveSamplingResult = {
      finalSampleSize: utilities.length,
      estimatedOptimalSize: Math.min(estimatedOptimalSize, config.maxSamples),
      converged,
      varianceHistory,
      convergenceReason,
      efficiencyGain,
    };

    return {
      expectedUtility: statistics.mean,
      statistics,
      confidenceInterval,
      dimensionExpectations,
      riskMetrics,
      feasibilityProbability: feasibleCount / utilities.length,
      samplingDetails: {
        totalSamples: utilities.length,
        convergenceAchieved: converged,
        effectiveSampleSize: this.estimateEffectiveSampleSize(utilities),
      },
      adaptiveSampling: adaptiveSamplingResult,
    };
  }

  /**
   * P1.3 优化：估计达到目标精度所需的采样数
   *
   * 基于初始采样估计方差，计算满足 σ/√N < ε 的最小 N
   */
  estimateRequiredSampleSize(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    targetCoefOfVariation: number = 0.05,
    pilotSampleSize: number = 100,
    deterministicWorld?: WorldModelContext,
  ): { estimatedSize: number; pilotMean: number; pilotStd: number; confidence: number } {
    const worldSamples = this.sampleWorldStates(probabilisticContext, pilotSampleSize);
    const utilities: number[] = [];
    const features = this.planFeatures.extract(plan);
    const exposure = this.exposureMap.extract(plan);

    for (const sample of worldSamples) {
      const evaluation = this.evaluateOneSample(
        plan,
        features,
        exposure,
        sample,
        weights,
        deterministicWorld,
      );
      utilities.push(evaluation.utility);
    }

    const pilotMean = this.mean(utilities);
    const pilotVariance = this.variance(utilities);
    const pilotStd = Math.sqrt(pilotVariance);

    const targetStandardError = Math.abs(pilotMean) * targetCoefOfVariation;
    const estimatedSize = Math.ceil(pilotVariance / Math.pow(targetStandardError, 2));

    const confidence = pilotSampleSize >= 30 ? 0.9 : 0.7;

    return {
      estimatedSize: Math.max(pilotSampleSize, estimatedSize),
      pilotMean,
      pilotStd,
      confidence,
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
    if (config.seed !== undefined) {
      this.initializeRNG(config.seed);
    }
    // 使用配对采样（同一世界状态下比较）
    const worldSamples = this.sampleWorldStates(probabilisticContext, config.sampleSize);
    const featuresA = this.planFeatures.extract(planA);
    const exposureA = this.exposureMap.extract(planA);
    const featuresB = this.planFeatures.extract(planB);
    const exposureB = this.exposureMap.extract(planB);
    
    const differences: number[] = [];
    let aWins = 0;
    
    for (const sample of worldSamples) {
      const utilityA = this.evaluateOneSample(
        planA,
        featuresA,
        exposureA,
        sample,
        weights,
        config.deterministicWorld,
      ).utility;
      const utilityB = this.evaluateOneSample(
        planB,
        featuresB,
        exposureB,
        sample,
        weights,
        config.deterministicWorld,
      ).utility;
      
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
          status: this.sampleCategorical(road.status) as 'OPEN' | 'RESTRICTED' | 'CLOSED',
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
   * 单样本效用：可选与确定性 `ObjectiveFunctionService` 对齐（同 breakdown 语义 + 调用方 weights）。
   */
  private evaluateOneSample(
    plan: RoutePlanDraft,
    features: PlanFeatures,
    exposure: ExposureMap,
    sample: WorldStateSample,
    weights: ObjectiveFunctionWeights,
    deterministicWorld?: WorldModelContext,
  ): {
    utility: number;
    dimensions: Record<string, number>;
    isFeasible: boolean;
  } {
    if (deterministicWorld) {
      try {
        const world = this.materializeDeterministicWorld(deterministicWorld, sample);
        const res = this.objectiveFunction.evaluate(plan, world);
        const utility = this.totalUtilityFromBreakdown(res.breakdown, weights);
        const dimensions = this.breakdownToDimensionMap(res.breakdown);
        return { utility, dimensions, isFeasible: res.isFeasible };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[ExpectedUtility] 确定性目标评估失败，回退启发式 MC: ${msg}`);
      }
    }
    return this.evaluatePlanWithSample(plan, features, exposure, sample, weights);
  }

  private totalUtilityFromBreakdown(
    breakdown: ObjectiveEvaluationResult['breakdown'],
    weights: ObjectiveFunctionWeights,
  ): number {
    const positive =
      weights.safety * breakdown.safetyScore +
      weights.experienceDensity * breakdown.experienceScore +
      weights.philosophyAlignment * breakdown.philosophyScore +
      weights.timeSlack * breakdown.timeSlackScore;
    const negative =
      weights.fatigueRisk * breakdown.fatigueRiskPenalty +
      weights.weatherRisk * breakdown.weatherRiskPenalty +
      weights.budgetOverrun * breakdown.budgetOverrunPenalty +
      weights.pacingVariance * breakdown.pacingVariancePenalty;
    let u = positive - negative;
    if (Number.isNaN(u)) u = 0;
    return Math.max(0, Math.min(1, u));
  }

  private breakdownToDimensionMap(breakdown: ObjectiveEvaluationResult['breakdown']): Record<string, number> {
    return {
      safety: breakdown.safetyScore,
      experience: breakdown.experienceScore,
      philosophy: breakdown.philosophyScore,
      timeSlack: breakdown.timeSlackScore,
      fatigueRisk: breakdown.fatigueRiskPenalty,
      weatherRisk: breakdown.weatherRiskPenalty,
      budgetOverrun: breakdown.budgetOverrunPenalty,
      pacingVariance: breakdown.pacingVariancePenalty,
    };
  }

  private materializeDeterministicWorld(base: WorldModelContext, sample: WorldStateSample): WorldModelContext {
    const world = structuredClone(base) as WorldModelContext;

    for (const rs of sample.roadStatuses) {
      const idx = world.physical.roadStates.findIndex(r => r.roadId === rs.roadId);
      if (idx < 0) continue;
      const prev = world.physical.roadStates[idx] as RoadState;
      let status: RoadState['status'] = 'OPEN';
      if (rs.status === 'CLOSED') status = 'CLOSED';
      else if (rs.status === 'RESTRICTED') status = 'RESTRICTED';
      world.physical.roadStates[idx] = { ...prev, status };
    }

    for (const h of sample.hazardLevels) {
      const idx = world.physical.hazardZones.findIndex(
        z => String(z.type).toUpperCase() === String(h.type).toUpperCase(),
      );
      if (idx < 0) continue;
      const prev = world.physical.hazardZones[idx] as HazardZoneState;
      if (!h.occurred) {
        world.physical.hazardZones[idx] = { ...prev, level: 'NONE' };
        continue;
      }
      const level: HazardZoneState['level'] =
        h.level === 'HIGH' ? 'HIGH' : h.level === 'MEDIUM' ? 'MEDIUM' : 'LOW';
      const month = world.physical.month;
      if (level === 'HIGH' && !(prev.seasonality?.highRiskMonths?.includes(month) ?? false)) {
        world.physical.hazardZones[idx] = {
          ...prev,
          level,
          seasonality: {
            highRiskMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            lowRiskMonths: prev.seasonality?.lowRiskMonths ?? [],
          },
        };
      } else {
        world.physical.hazardZones[idx] = { ...prev, level };
      }
    }

    const asc = sample.humanCapability.maxDailyAscentM;
    world.human = {
      ...world.human,
      maxDailyAscentM: typeof asc === 'number' && !Number.isNaN(asc) ? Math.max(1, asc) : world.human.maxDailyAscentM,
    };

    this.applySampleWeatherToClimate(world, sample);

    return world;
  }

  private applySampleWeatherToClimate(world: WorldModelContext, sample: WorldStateSample): void {
    const cs = world.physical.climateSeasonality;
    if (!cs) return;
    const baseAccRaw = Number(cs.accessibilityScore);
    const baseAcc = Number.isFinite(baseAccRaw) ? baseAccRaw : 0.7;
    let adj = baseAcc;
    if (sample.weather.windSpeedMs > 18) adj -= 0.06;
    if (sample.weather.windSpeedMs > 25) adj -= 0.05;
    if (sample.weather.precipitationMm > 8) adj -= 0.07;
    if (sample.weather.precipitationMm > 20) adj -= 0.05;
    if (sample.weather.visibilityM < 600) adj -= 0.06;
    if (sample.weather.condition === 'rain' || sample.weather.condition === 'snow') adj -= 0.04;

    world.physical.climateSeasonality = {
      ...cs,
      accessibilityScore: Math.max(0, Math.min(1, adj)),
      typicalWeather: {
        ...(cs.typicalWeather ?? {}),
        windSpeedMps: sample.weather.windSpeedMs,
        precipitationMmPerHour: Math.min(50, sample.weather.precipitationMm / 12),
        visibilityMeters: sample.weather.visibilityM,
        temperatureCelsius: sample.weather.temperatureC,
      },
    };
  }

  /**
   * 使用采样的世界状态评估计划
   */
  private evaluatePlanWithSample(
    plan: RoutePlanDraft,
    features: PlanFeatures,
    exposure: ExposureMap,
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
    let experienceScore = 0.78;
    if (sample.weather.condition === 'rain' || sample.weather.condition === 'snow') {
      experienceScore -= 0.2;
    }
    // plan-conditioned: too dense reduces experience (rush), moderate density helps.
    const density = features.avgSegmentsPerDay;
    const densityBoost = density >= 3 && density <= 5 ? 0.12 : density >= 2 && density <= 6 ? 0.06 : -0.02;
    experienceScore += densityBoost;
    dimensions['experience'] = experienceScore;
    
    // 哲学匹配：相对稳定
    dimensions['philosophy'] = 0.85;
    
    // 时间余量：受延误影响
    let timeSlackScore = 0.78;
    const restrictedRoads = sample.roadStatuses.filter(r => r.status === 'RESTRICTED').length;
    timeSlackScore -= restrictedRoads * 0.1;
    // plan-conditioned: tighter schedules have less slack.
    timeSlackScore -= 0.35 * features.slackTightness01;
    dimensions['timeSlack'] = Math.max(0, timeSlackScore);
    
    // 疲劳风险：受人体能力波动影响
    const fatigueRiskBase = Math.max(0, 1 - sample.humanCapability.fatigueThreshold / 1.5);
    // plan-conditioned: effort increases fatigue risk.
    const fatigueRisk = Math.min(1, fatigueRiskBase + 0.55 * features.effort01 + 0.25 * features.slackTightness01);
    dimensions['fatigueRisk'] = fatigueRisk;
    
    // 天气风险
    let weatherRisk = 0;
    if (sample.weather.precipitationMm > 10) weatherRisk += 0.3;
    if (sample.weather.windSpeedMs > 15) weatherRisk += 0.2;
    dimensions['weatherRisk'] = Math.min(1, weatherRisk);
    
    // 预算风险（简化）
    dimensions['budgetOverrun'] = 0.1;
    
    // 节奏方差（简化）
    // plan-conditioned: tighter schedules tend to have higher pacing variance.
    dimensions['pacingVariance'] = Math.min(1, 0.08 + 0.35 * features.slackTightness01);
    
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
    // plan-conditioned feasibility: dense/tight plans are more likely to fail under bad samples.
    const structuralFragility = Math.min(1, 0.55 * features.slackTightness01 + 0.45 * features.effort01);
    const safetyFloor = 0.35 + 0.25 * structuralFragility; // more fragile needs higher safety margin
    // Exposure-aware: if plan touches specific roads/hazards, bad samples matter more.
    const touchesRoad = (exposure.roadIdsTouched?.length ?? 0) > 0;
    const touchesHazard = (exposure.hazardTypesTouched?.length ?? 0) > 0;
    const feasibleUnderRoads = closedRoads === 0 || (!touchesRoad && structuralFragility < 0.25);
    const feasibleUnderHazard = hazardOccurred === 0 || (!touchesHazard && structuralFragility < 0.2);
    const isFeasible = feasibleUnderRoads && feasibleUnderHazard && dimensions['safety'] > safetyFloor;
    
    return { utility, dimensions, isFeasible };
  }

  // ========== 采样方法 ==========

  /**
   * 高斯分布采样
   */
  private sampleGaussian(dist: GaussianDistribution): number {
    const z = this.sampleStandardNormal();
    return dist.params.mean + Math.sqrt(dist.params.variance) * z;
  }

  /**
   * Beta 分布采样 - 使用 Gamma 分布比值法
   * Beta(α, β) = X / (X + Y)，其中 X ~ Gamma(α, 1), Y ~ Gamma(β, 1)
   * 
   * 专利实现：真正的 Beta 分布采样，替代简化的正态近似
   */
  private sampleBeta(dist: BetaDistribution): number {
    const alpha = dist.params.alpha;
    const beta = dist.params.beta;
    
    // 使用 Gamma 分布比值法
    const x = this.sampleGamma(alpha, 1);
    const y = this.sampleGamma(beta, 1);
    
    if (x + y === 0) {
      // 边界情况，返回均值
      return alpha / (alpha + beta);
    }
    
    return x / (x + y);
  }

  /**
   * Gamma 分布采样 - Marsaglia and Tsang's Method
   * 对于 shape >= 1，使用 Marsaglia-Tsang 变换
   * 对于 shape < 1，使用 Ahrens-Dieter 方法
   * 
   * 专利实现：支持 Monte Carlo 采样的基础分布
   */
  private sampleGamma(shape: number, scale: number): number {
    if (shape < 1) {
      // Ahrens-Dieter method for shape < 1
      // Gamma(α) = Gamma(α + 1) * U^(1/α)
      const sample = this.sampleGamma(shape + 1, 1);
      return scale * sample * Math.pow(this.rng(), 1 / shape);
    }
    
    // Marsaglia and Tsang's method for shape >= 1
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x: number;
      let v: number;
      
      do {
        x = this.sampleStandardNormal();
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = this.rng();
      
      // 快速接受检验
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return scale * d * v;
      }
      
      // 完整接受检验
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return scale * d * v;
      }
    }
  }

  /**
   * 标准正态分布采样 - Box-Muller 变换
   */
  private sampleStandardNormal(): number {
    const u1 = this.rng();
    const u2 = this.rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
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

  /**
   * 有效样本数估计 (ESS) - 使用自相关分析
   * ESS = N / (1 + 2 * Σ ρ_k)，其中 ρ_k 为 k 阶自相关系数
   * 
   * 专利实现：用于评估 Monte Carlo 采样质量
   */
  private estimateEffectiveSampleSize(values: number[]): number {
    const n = values.length;
    if (n < 10) return n;

    const m = this.mean(values);
    const v = this.variance(values);
    
    if (v === 0) return n;

    // 计算自相关函数
    let sumRho = 0;
    const maxLag = Math.min(Math.floor(n / 4), 50); // 限制最大滞后
    
    for (let k = 1; k <= maxLag; k++) {
      let autoCorr = 0;
      for (let i = 0; i < n - k; i++) {
        autoCorr += (values[i] - m) * (values[i + k] - m);
      }
      autoCorr /= (n - k) * v;
      
      // 当自相关变为负值或非常小时停止
      if (autoCorr < 0.05) break;
      
      sumRho += autoCorr;
    }

    // ESS = N / (1 + 2 * Σ ρ_k)
    const ess = n / (1 + 2 * sumRho);
    return Math.max(1, Math.min(n, ess));
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

  // ========== 重要性采样 (Importance Sampling) ==========

  /**
   * 使用重要性采样计算期望效用
   * 
   * 专利实现：通过提议分布 q(s) 采样，使用权重 w(s) = p(s)/q(s) 校正
   * E_p[f(s)] = E_q[f(s) * w(s)]
   * 
   * 目的：降低方差，提高采样效率，特别是对于稀有事件
   */
  computeExpectedUtilityWithImportanceSampling(
    plan: RoutePlanDraft,
    probabilisticContext: ProbabilisticWorldModelContext,
    weights: ObjectiveFunctionWeights,
    config: ImportanceSamplingConfig,
  ): ExpectedUtilityResult & { importanceSampling: ImportanceSamplingResult } {
    this.logger.debug(`[ExpectedUtility] 使用重要性采样，提议类型: ${config.proposalType}`);
    const features = this.planFeatures.extract(plan);
    const exposure = this.exposureMap.extract(plan);

    // 初始化随机数生成器
    if (config.seed !== undefined) {
      this.initializeRNG(config.seed);
    }

    // 1. 创建提议分布
    const proposalContext = this.createProposalDistribution(
      probabilisticContext,
      config,
    );

    // 2. 从提议分布采样
    const samples = this.sampleWorldStates(proposalContext, config.sampleSize);

    // 3. 计算重要性权重 w(s) = p(s) / q(s)
    const importanceWeights = samples.map(sample =>
      this.computeImportanceWeight(sample, probabilisticContext, proposalContext),
    );

    // 4. 权重截断（防止方差爆炸）
    const maxWeightRatio = config.maxWeightRatio ?? 10;
    const meanWeight = this.mean(importanceWeights);
    const truncatedWeights = importanceWeights.map(w =>
      Math.min(w, meanWeight * maxWeightRatio),
    );

    // 5. 归一化权重
    const weightSum = truncatedWeights.reduce((a, b) => a + b, 0);
    const normalizedWeights = truncatedWeights.map(w => w / weightSum);

    // 6. 计算加权效用
    const utilities: number[] = [];
    const weightedUtilities: number[] = [];
    const dimensionSamples: Record<string, number[]> = {
      safety: [], experience: [], philosophy: [], timeSlack: [],
      fatigueRisk: [], weatherRisk: [], budgetOverrun: [], pacingVariance: [],
    };
    let feasibleCount = 0;

    for (let i = 0; i < samples.length; i++) {
      const evaluation = this.evaluateOneSample(
        plan,
        features,
        exposure,
        samples[i],
        weights,
        config.deterministicWorld,
      );
      utilities.push(evaluation.utility);
      weightedUtilities.push(evaluation.utility * normalizedWeights[i] * samples.length);

      for (const dim of Object.keys(dimensionSamples)) {
        dimensionSamples[dim].push(evaluation.dimensions[dim] || 0);
      }

      if (evaluation.isFeasible) {
        feasibleCount += normalizedWeights[i];
      }
    }

    // 7. 计算有效样本数 ESS = 1 / Σ w_i²
    const sumSquaredWeights = normalizedWeights.reduce((sum, w) => sum + w * w, 0);
    const effectiveSampleSize = 1 / sumSquaredWeights;

    // 8. 计算统计量
    const weightedMean = normalizedWeights.reduce(
      (sum, w, i) => sum + w * utilities[i],
      0,
    );

    // 标准 Monte Carlo 的方差
    const standardVariance = this.variance(utilities);
    // 重要性采样的方差（近似）
    const isVariance = normalizedWeights.reduce(
      (sum, w, i) => sum + w * Math.pow(utilities[i] - weightedMean, 2),
      0,
    );
    const varianceReductionRatio = standardVariance > 0 ? isVariance / standardVariance : 1;

    // 9. 计算诊断信息
    const weightEntropy = -normalizedWeights
      .filter(w => w > 0)
      .reduce((sum, w) => sum + w * Math.log(w), 0);

    const importanceSamplingResult: ImportanceSamplingResult = {
      weightedMean,
      effectiveSampleSize,
      weights: truncatedWeights,
      normalizedWeights,
      varianceReductionRatio,
      diagnostics: {
        maxWeight: Math.max(...truncatedWeights),
        minWeight: Math.min(...truncatedWeights),
        weightVariance: this.variance(truncatedWeights),
        weightEntropy,
      },
    };

    // 10. 构建完整结果
    const statistics = this.computeStatistics(utilities);
    statistics.mean = weightedMean; // 使用加权均值

    const confidenceInterval = this.computeWeightedConfidenceInterval(
      utilities,
      normalizedWeights,
      config.confidenceLevel ?? 0.95,
    );

    const dimensionExpectations: any = {};
    for (const dim of Object.keys(dimensionSamples)) {
      dimensionExpectations[dim] = normalizedWeights.reduce(
        (sum, w, i) => sum + w * dimensionSamples[dim][i],
        0,
      );
    }

    const riskMetrics = this.computeWeightedRiskMetrics(utilities, normalizedWeights);

    return {
      expectedUtility: weightedMean,
      statistics,
      confidenceInterval,
      dimensionExpectations,
      riskMetrics,
      feasibilityProbability: feasibleCount,
      samplingDetails: {
        totalSamples: samples.length,
        convergenceAchieved: false,
        effectiveSampleSize: Math.round(effectiveSampleSize),
      },
      importanceSampling: importanceSamplingResult,
    };
  }

  /**
   * 创建提议分布
   * 
   * 策略：根据配置类型修改原始分布以提高采样效率
   */
  private createProposalDistribution(
    original: ProbabilisticWorldModelContext,
    config: ImportanceSamplingConfig,
  ): ProbabilisticWorldModelContext {
    const proposal = JSON.parse(JSON.stringify(original)) as ProbabilisticWorldModelContext;

    switch (config.proposalType) {
      case 'SHIFTED_MEAN':
        // 将均值向风险方向偏移，以更多采样风险区域
        const shiftFactor = config.shiftFactor ?? 0.3;
        proposal.physical.weather.windSpeed.params.mean *= (1 + shiftFactor);
        proposal.physical.weather.precipitation.params.mean *= (1 + shiftFactor);
        break;

      case 'WIDENED_VARIANCE':
        // 扩大方差以覆盖更多尾部事件
        const expansion = config.varianceExpansion ?? 2;
        proposal.physical.weather.windSpeed.params.variance *= expansion;
        proposal.physical.weather.precipitation.params.variance *= expansion;
        proposal.human.maxDailyAscent.params.variance *= expansion;
        proposal.human.fatigueThreshold.params.variance *= expansion;
        break;

      case 'MIXTURE':
        // 混合分布：组合原始分布和扩展分布
        // 这里简化为扩大方差
        proposal.physical.weather.windSpeed.params.variance *= 1.5;
        proposal.physical.weather.precipitation.params.variance *= 1.5;
        proposal.human.maxDailyAscent.params.variance *= 1.5;
        break;
    }

    return proposal;
  }

  /**
   * 计算重要性权重 w(s) = p(s) / q(s)
   */
  private computeImportanceWeight(
    sample: WorldStateSample,
    targetContext: ProbabilisticWorldModelContext,
    proposalContext: ProbabilisticWorldModelContext,
  ): number {
    // 计算目标分布下的概率密度
    const targetLogProb = this.computeLogProbability(sample, targetContext);
    // 计算提议分布下的概率密度
    const proposalLogProb = this.computeLogProbability(sample, proposalContext);

    // w(s) = exp(log p(s) - log q(s))
    const logWeight = targetLogProb - proposalLogProb;
    
    // 防止数值溢出
    return Math.exp(Math.max(-20, Math.min(20, logWeight)));
  }

  /**
   * 计算样本在分布下的对数概率密度
   */
  private computeLogProbability(
    sample: WorldStateSample,
    context: ProbabilisticWorldModelContext,
  ): number {
    let logProb = 0;

    // 天气因素
    logProb += this.gaussianLogPdf(
      sample.weather.windSpeedMs,
      context.physical.weather.windSpeed.params.mean,
      context.physical.weather.windSpeed.params.variance,
    );
    logProb += this.gaussianLogPdf(
      sample.weather.precipitationMm,
      context.physical.weather.precipitation.params.mean,
      context.physical.weather.precipitation.params.variance,
    );

    // 人体能力因素
    logProb += this.gaussianLogPdf(
      sample.humanCapability.maxDailyAscentM,
      context.human.maxDailyAscent.params.mean,
      context.human.maxDailyAscent.params.variance,
    );

    return logProb;
  }

  /**
   * 高斯分布对数概率密度函数
   */
  private gaussianLogPdf(x: number, mean: number, variance: number): number {
    if (variance <= 0) return 0;
    const diff = x - mean;
    return -0.5 * Math.log(2 * Math.PI * variance) - (diff * diff) / (2 * variance);
  }

  /**
   * 计算加权置信区间
   */
  private computeWeightedConfidenceInterval(
    values: number[],
    weights: number[],
    level: number,
  ): { lower: number; upper: number; level: number } {
    // 创建加权排序
    const indexed = values.map((v, i) => ({ value: v, weight: weights[i] }));
    indexed.sort((a, b) => a.value - b.value);

    const alpha = 1 - level;
    let cumWeight = 0;
    let lower = indexed[0].value;
    let upper = indexed[indexed.length - 1].value;

    for (const item of indexed) {
      cumWeight += item.weight;
      if (cumWeight >= alpha / 2 && lower === indexed[0].value) {
        lower = item.value;
      }
      if (cumWeight >= 1 - alpha / 2) {
        upper = item.value;
        break;
      }
    }

    return { lower, upper, level };
  }

  /**
   * 计算加权风险指标
   */
  private computeWeightedRiskMetrics(
    utilities: number[],
    weights: number[],
  ): ExpectedUtilityResult['riskMetrics'] {
    const threshold = 0.5;
    
    // 加权下行风险概率
    let downRiskProbability = 0;
    for (let i = 0; i < utilities.length; i++) {
      if (utilities[i] < threshold) {
        downRiskProbability += weights[i];
      }
    }

    // 加权分位数
    const indexed = utilities.map((v, i) => ({ value: v, weight: weights[i] }));
    indexed.sort((a, b) => a.value - b.value);

    let cumWeight = 0;
    let worstCase = indexed[0].value;
    let bestCase = indexed[indexed.length - 1].value;

    for (const item of indexed) {
      cumWeight += item.weight;
      if (cumWeight >= 0.05 && worstCase === indexed[0].value) {
        worstCase = item.value;
      }
      if (cumWeight >= 0.95) {
        bestCase = item.value;
        break;
      }
    }

    // 加权波动性
    const weightedMean = weights.reduce((sum, w, i) => sum + w * utilities[i], 0);
    const weightedVariance = weights.reduce(
      (sum, w, i) => sum + w * Math.pow(utilities[i] - weightedMean, 2),
      0,
    );

    return {
      downRiskProbability,
      worstCase,
      bestCase,
      volatility: Math.sqrt(weightedVariance),
    };
  }
}
