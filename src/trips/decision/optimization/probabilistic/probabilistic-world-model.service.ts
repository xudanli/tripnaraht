// src/trips/decision/optimization/probabilistic/probabilistic-world-model.service.ts
/**
 * 概率世界模型服务
 *
 * 核心职责：
 * 1. 将确定性世界模型转换为概率模型
 * 2. 支持贝叶斯更新
 * 3. 提供条件概率查询
 * 4. 状态转移预测 predictOutcome(State, Action)（专利升级点③）
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  GaussianDistribution,
  BetaDistribution,
  TruncatedNormalDistribution,
  CategoricalDistribution,
  createGaussian,
  createTruncatedNormal,
  createCategorical,
  fromProbabilityEstimate,
} from './distribution.interface';
import {
  ProbabilisticWorldModelContext,
  ProbabilisticPhysicalReality,
  ProbabilisticHumanCapability,
  ProbabilisticWeather,
  ProbabilisticRoadStatus,
  ProbabilisticHazard,
  WorldStateSample,
  WorldStateObservation,
  UncertaintyConfig,
  DEFAULT_UNCERTAINTY_CONFIG,
  IProbabilisticWorldModelService,
  ConditionalProbabilityQuery,
  DecisionAction,
  OutcomePrediction,
} from './probabilistic-world-model.interface';
import { WorldModelContext } from '../../shared/world-model.types';
import type { PlanFeatures } from '../plan-features/plan-features.service';
import { ExposureMapService } from '../plan-features/exposure-map.service';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

@Injectable()
export class ProbabilisticWorldModelService implements IProbabilisticWorldModelService {
  private readonly logger = new Logger(ProbabilisticWorldModelService.name);
  constructor(private readonly exposureMap: ExposureMapService) {}

  /**
   * 从确定性世界模型转换为概率模型
   * 
   * 这是 Phase 2 的核心迁移方法
   */
  fromDeterministicModel(
    deterministicContext: WorldModelContext,
    uncertaintyConfig: UncertaintyConfig = DEFAULT_UNCERTAINTY_CONFIG
  ): ProbabilisticWorldModelContext {
    this.logger.debug('[ProbabilisticWorldModel] 开始转换确定性模型');

    // 参数验证
    if (!deterministicContext) {
      throw new Error('转换失败: deterministicContext 不能为空');
    }
    if (!deterministicContext.physical) {
      throw new Error('转换失败: deterministicContext.physical 不能为空');
    }
    if (!deterministicContext.human) {
      throw new Error('转换失败: deterministicContext.human 不能为空');
    }
    if (!deterministicContext.routeDirection) {
      throw new Error('转换失败: deterministicContext.routeDirection 不能为空');
    }

    // 1. 转换物理现实
    const physical = this.convertPhysicalReality(
      deterministicContext.physical,
      uncertaintyConfig
    );

    // 2. 转换人体能力
    const human = this.convertHumanCapability(
      deterministicContext.human,
      uncertaintyConfig
    );

    // 3. 路线方向保持不变
    const routeDirection = {
      id: String(deterministicContext.routeDirection.id || 'unknown'),
      name: String(deterministicContext.routeDirection.name || deterministicContext.routeDirection.id || 'unknown'),
      philosophy: deterministicContext.routeDirection.philosophy,
      constraints: deterministicContext.routeDirection.constraints,
    };

    return {
      physical,
      human,
      routeDirection,
      modelVersion: '2.0.0',
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 转换物理现实模型
   */
  private convertPhysicalReality(
    physical: WorldModelContext['physical'],
    config: UncertaintyConfig
  ): ProbabilisticPhysicalReality {
    // 天气转换
    const weather = this.convertWeather(physical, config);

    // 道路状态转换
    const roadStatuses = this.convertRoadStatuses(physical.roadStates, config);

    // 危险区域转换
    const hazards = this.convertHazards(physical.hazardZones, config);

    // 气候可达性
    const accessibilityScore = physical.climateSeasonality?.accessibilityScore ?? 0.7;
    const climateAccessibility = fromProbabilityEstimate(
      accessibilityScore,
      20 / config.weatherUncertainty
    ) as BetaDistribution;

    // 日照时间（简化估计）
    const month = physical.month;
    const baseHours = 12 + 4 * Math.sin((month - 3) * Math.PI / 6); // 北半球近似
    const daylightHours = createGaussian(baseHours, 0.5, 0.9);

    return {
      month: physical.month,
      weather,
      roadStatuses,
      hazards,
      transportServices: [], // 简化：暂不实现
      climateAccessibility,
      daylightHours,
    };
  }

  /**
   * 转换天气模型
   */
  private convertWeather(
    physical: WorldModelContext['physical'],
    config: UncertaintyConfig
  ): ProbabilisticWeather {
    const climate = physical.climateSeasonality;
    const uncertainty = config.weatherUncertainty;

    // 风速：从可达性推断
    // 可达性低通常意味着风速高
    const accessibilityScore = climate?.accessibilityScore ?? 0.7;
    const baseWindSpeed = 5 + (1 - accessibilityScore) * 20; // 5-25 m/s
    const windSpeed = createGaussian(
      baseWindSpeed,
      Math.pow(baseWindSpeed * uncertainty, 2),
      0.7
    );

    // 降水：从月份推断季节
    const month = physical.month;
    const isWinter = month >= 11 || month <= 2;
    const isSpring = month >= 3 && month <= 5;
    const basePrecipitation = isWinter ? 15 : isSpring ? 10 : 5;
    const precipitation = createGaussian(
      basePrecipitation,
      Math.pow(basePrecipitation * uncertainty * 2, 2),
      0.6
    );

    // 能见度
    const baseVisibility = accessibilityScore * 10000; // 0-10000m
    const visibility = createGaussian(
      baseVisibility,
      Math.pow(baseVisibility * uncertainty, 2),
      0.7
    );

    // 温度：从月份和海拔推断
    const monthTemp = 15 - Math.abs(physical.month - 7) * 2; // 简化北半球
    const temperature = createGaussian(monthTemp, 25, 0.8);

    // 天气状态分布
    let conditionProbs: number[];
    if (accessibilityScore > 0.8) {
      conditionProbs = [0.6, 0.25, 0.1, 0.05]; // 晴/多云/雨/雪
    } else if (accessibilityScore > 0.5) {
      conditionProbs = [0.3, 0.35, 0.25, 0.1];
    } else {
      conditionProbs = [0.1, 0.2, 0.4, 0.3];
    }
    const condition = createCategorical(
      ['clear', 'cloudy', 'rain', 'snow'],
      conditionProbs,
      0.6
    );

    // 极端天气概率
    const extremeEventProbability = Math.max(0, 0.3 - accessibilityScore * 0.3);

    return {
      windSpeed,
      precipitation,
      visibility,
      temperature,
      condition,
      extremeEventProbability,
      forecastHorizon: 72, // 72 小时预报
      uncertaintyGrowthRate: 0.1, // 每 24 小时不确定性增长 10%
    };
  }

  /**
   * 转换道路状态
   */
  private convertRoadStatuses(
    roadStates: WorldModelContext['physical']['roadStates'],
    config: UncertaintyConfig
  ): ProbabilisticRoadStatus[] {
    if (!Array.isArray(roadStates)) {
      return [];
    }
    return roadStates.map(road => {
      // 根据当前状态确定概率分布
      // 内部使用 OPEN/RESTRICTED/CLOSED 三态（RESTRICTED 包含 SEASONAL 和 RESTRICTED）
      let statusProbs: number[];
      switch (road.status) {
        case 'OPEN':
          statusProbs = [0.85, 0.12, 0.03];
          break;
        case 'SEASONAL':
        case 'RESTRICTED':
          statusProbs = [0.4, 0.45, 0.15];
          break;
        case 'CLOSED':
          statusProbs = [0.1, 0.2, 0.7];
          break;
        default:
          statusProbs = [0.6, 0.3, 0.1];
      }

      // 应用不确定性
      const adjustedProbs = statusProbs.map(p => 
        p * (1 - config.roadStatusUncertainty) + (1/3) * config.roadStatusUncertainty
      );
      // 归一化
      const sum = adjustedProbs.reduce((a, b) => a + b, 0);
      const normalizedProbs = adjustedProbs.map(p => p / sum);

      return {
        roadId: road.roadId,
        roadName: road.metadata?.roadName as string | undefined,
        status: createCategorical(
          ['OPEN', 'RESTRICTED', 'CLOSED'],
          normalizedProbs,
          road.status === 'OPEN' ? 0.8 : 0.6
        ),
        conditionQuality: road.metadata?.conditionScore !== undefined
          ? fromProbabilityEstimate(road.metadata.conditionScore as number, 15) as BetaDistribution
          : undefined,
      };
    });
  }

  /**
   * 转换危险区域
   */
  private convertHazards(
    hazardZones: WorldModelContext['physical']['hazardZones'],
    _config: UncertaintyConfig
  ): ProbabilisticHazard[] {
    if (!Array.isArray(hazardZones)) {
      return [];
    }
    return hazardZones.map(hazard => {
      // 风险等级分布
      let levelProbs: number[];
      switch (hazard.level) {
        case 'HIGH':
          levelProbs = [0.1, 0.2, 0.7];
          break;
        case 'MEDIUM':
          levelProbs = [0.25, 0.5, 0.25];
          break;
        case 'LOW':
        default:
          levelProbs = [0.7, 0.2, 0.1];
      }

      // 发生概率：基于风险等级
      const baseOccurrenceProb = hazard.level === 'HIGH' ? 0.4 
        : hazard.level === 'MEDIUM' ? 0.2 
        : 0.05;

      // 影响程度
      const baseImpact = hazard.level === 'HIGH' ? 0.8 
        : hazard.level === 'MEDIUM' ? 0.5 
        : 0.2;

      return {
        type: hazard.type,
        riskLevel: createCategorical(['LOW', 'MEDIUM', 'HIGH'], levelProbs, 0.7),
        occurrenceProbability: fromProbabilityEstimate(baseOccurrenceProb, 10) as BetaDistribution,
        impactSeverity: fromProbabilityEstimate(baseImpact, 15) as BetaDistribution,
      };
    });
  }

  /**
   * 转换人体能力模型
   */
  private convertHumanCapability(
    human: WorldModelContext['human'],
    config: UncertaintyConfig
  ): ProbabilisticHumanCapability {
    const uncertainty = config.humanCapabilityUncertainty;

    // 最大单日爬升
    const maxDailyAscentVariance = Math.pow(human.maxDailyAscentM * uncertainty, 2);
    const maxDailyAscent = createGaussian(
      human.maxDailyAscentM,
      maxDailyAscentVariance,
      human.confidenceLevel === 'HIGH' ? 0.85 : human.confidenceLevel === 'LOW' ? 0.5 : 0.7
    );

    // 3天滚动爬升
    const rollingVariance = Math.pow(human.rollingAscent3DaysM * uncertainty, 2);
    const rollingAscent3Days = createGaussian(
      human.rollingAscent3DaysM,
      rollingVariance,
      0.7
    );

    // 疲劳容忍度（1.0 为标准，1.4+ 为高负荷）
    // 均值基于用户体能水平
    const baseFatigueThreshold = human.fitnessLevel === 'HIGH' ? 1.3
      : human.fitnessLevel === 'LOW' ? 1.0
      : 1.15;
    const fatigueThreshold = createTruncatedNormal(
      baseFatigueThreshold,
      0.04, // 标准差约 0.2
      0.5,  // 下界
      2.0,  // 上界
      0.7
    );

    // 恢复速率（每天恢复的疲劳比例）
    const baseRecoveryRate = human.fitnessLevel === 'HIGH' ? 0.35
      : human.fitnessLevel === 'LOW' ? 0.2
      : 0.25;
    const recoveryRate = fromProbabilityEstimate(baseRecoveryRate, 15) as BetaDistribution;

    // 风险容忍度分布
    let riskToleranceProbs: number[];
    switch (human.riskTolerance) {
      case 'LOW':
        riskToleranceProbs = [0.7, 0.25, 0.05];
        break;
      case 'HIGH':
        riskToleranceProbs = [0.1, 0.3, 0.6];
        break;
      default:
        riskToleranceProbs = [0.25, 0.5, 0.25];
    }
    const riskTolerance = createCategorical(
      ['LOW', 'MEDIUM', 'HIGH'],
      riskToleranceProbs,
      0.8
    );

    // 节奏偏好分布
    let paceProbs: number[];
    switch (human.preferredPace) {
      case 'SLOW':
        paceProbs = [0.6, 0.3, 0.1];
        break;
      case 'FAST':
        paceProbs = [0.1, 0.3, 0.6];
        break;
      default:
        paceProbs = [0.2, 0.6, 0.2];
    }
    const pacePreference = createCategorical(
      ['SLOW', 'MODERATE', 'FAST'],
      paceProbs,
      0.85
    );

    return {
      maxDailyAscent,
      rollingAscent3Days,
      fatigueThreshold,
      recoveryRate,
      cumulativeEffectCoefficient: 0.03, // 每天累积 3%
      currentCumulativeFatigue: 0,
      riskTolerance,
      pacePreference,
      modelConfidence: human.confidenceLevel === 'HIGH' ? 0.85 
        : human.confidenceLevel === 'LOW' ? 0.5 
        : 0.7,
    };
  }

  /**
   * 采样世界状态
   */
  sampleWorldState(
    context: ProbabilisticWorldModelContext,
    n: number = 1
  ): WorldStateSample[] {
    // 委托给 ExpectedUtilityService
    // 这里提供简化实现
    const samples: WorldStateSample[] = [];
    
    for (let i = 0; i < n; i++) {
      samples.push({
        sampleId: `ws_${Date.now()}_${i}`,
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
        hazardLevels: context.physical.hazards.map(h => ({
          type: h.type,
          level: this.sampleCategorical(h.riskLevel) as 'LOW' | 'MEDIUM' | 'HIGH',
          occurred: Math.random() < this.betaMean(h.occurrenceProbability),
        })),
        feasibilityScore: 0.8, // 简化
      });
    }
    
    return samples;
  }

  /**
   * 查询条件概率
   */
  queryConditionalProbability(
    context: ProbabilisticWorldModelContext,
    query: ConditionalProbabilityQuery
  ): number {
    // 使用 Monte Carlo 估计条件概率
    const samples = this.sampleWorldState(context, 1000);
    
    let matchConditions = 0;
    let matchTarget = 0;
    
    for (const sample of samples) {
      // 检查条件是否满足
      const conditionsSatisfied = query.conditions.every(cond => {
        const value = this.getValueFromSample(sample, cond.variable);
        return this.checkCondition(value, cond.operator, cond.value);
      });
      
      if (conditionsSatisfied) {
        matchConditions++;
        // 检查目标（简化：假设目标是某个事件发生）
        const targetValue = this.getValueFromSample(sample, query.target);
        if (targetValue !== null && targetValue !== undefined) {
          matchTarget++;
        }
      }
    }
    
    return matchConditions > 0 ? matchTarget / matchConditions : 0;
  }

  /**
   * 贝叶斯更新
   */
  updateWithObservation(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): ProbabilisticWorldModelContext {
    this.logger.debug(`[ProbabilisticWorldModel] 贝叶斯更新: ${observation.type}`);
    
    // 创建深拷贝
    const updatedContext = JSON.parse(JSON.stringify(context)) as ProbabilisticWorldModelContext;
    
    switch (observation.type) {
      case 'WEATHER':
        this.updateWeatherDistribution(updatedContext, observation);
        break;
      case 'ROAD':
        this.updateRoadDistribution(updatedContext, observation);
        break;
      case 'HUMAN_PERFORMANCE':
        this.updateHumanCapabilityDistribution(updatedContext, observation);
        break;
      case 'HAZARD':
        this.updateHazardDistribution(updatedContext, observation);
        break;
    }
    
    updatedContext.lastUpdated = new Date().toISOString();
    return updatedContext;
  }

  /**
   * 预测未来状态
   */
  predictFutureState(
    context: ProbabilisticWorldModelContext,
    hoursAhead: number
  ): ProbabilisticWorldModelContext {
    const updatedContext = JSON.parse(JSON.stringify(context)) as ProbabilisticWorldModelContext;

    // 天气不确定性随时间增长
    const growthFactor = 1 + context.physical.weather.uncertaintyGrowthRate * (hoursAhead / 24);

    updatedContext.physical.weather.windSpeed.params.variance *= growthFactor;
    updatedContext.physical.weather.precipitation.params.variance *= growthFactor;
    updatedContext.physical.weather.visibility.params.variance *= growthFactor;
    updatedContext.physical.weather.temperature.params.variance *= growthFactor;

    // 置信度下降
    updatedContext.physical.weather.windSpeed.confidence /= growthFactor;
    updatedContext.physical.weather.precipitation.confidence /= growthFactor;

    return updatedContext;
  }

  /**
   * 状态转移预测（专利升级点③）
   * NextState = WorldModel(State, Action)，概率形式 s_{t+1} ~ P_θ(s|s_t,a_t)
   * 用于决策模拟、可行性预判、多步规划
   *
   * 参考：docs/Decision_OS_技术交底书.md 3.7.1
   */
  predictOutcome(
    context: ProbabilisticWorldModelContext,
    action: DecisionAction,
    options?: { includeSamples?: number }
  ): OutcomePrediction {
    this.logger.debug(`[ProbabilisticWorldModel] predictOutcome: action=${action.type}`);

    // 深拷贝作为预测的 nextState
    const nextState = JSON.parse(JSON.stringify(context)) as ProbabilisticWorldModelContext;
    nextState.lastUpdated = new Date().toISOString();

    const constraintViolations: string[] = [];
    let feasibilityProbability = 0.8; // 默认
    let estimatedUtility = 0.7; // 默认

    // 根据动作类型调整预测状态
    switch (action.type) {
      case 'PLAN_EVALUATION': {
        const pf = (action.payload as { planFeatures?: PlanFeatures } | undefined)?.planFeatures;
        const exposure = (action.payload as { exposure?: { roadIdsTouched?: string[]; hazardTypesTouched?: string[] } } | undefined)
          ?.exposure;
        if (pf) {
          const fragility = clamp01(0.55 * pf.slackTightness01 + 0.45 * pf.effort01);

          // Weather risk proxy from mean values (cheap but plan-conditioned through fragility).
          const windMean = Number(nextState.physical.weather.windSpeed.params.mean) || 0;
          const precipMean = Number(nextState.physical.weather.precipitation.params.mean) || 0;
          const visibilityMean = Number(nextState.physical.weather.visibility.params.mean) || 10000;
          const weatherRisk =
            clamp01(
              (windMean > 15 ? 0.25 : windMean > 10 ? 0.1 : 0) +
                (precipMean > 10 ? 0.25 : precipMean > 5 ? 0.1 : 0) +
                (visibilityMean < 800 ? 0.2 : visibilityMean < 1500 ? 0.1 : 0),
            );

          // Road closure probability proxy from categorical distributions.
          const roadClosedProbAvg =
            nextState.physical.roadStatuses.length > 0
              ? nextState.physical.roadStatuses
                  .map((r) => {
                    const cats = r.status.params.categories;
                    const probs = r.status.params.probabilities;
                    const idx = cats.indexOf('CLOSED');
                    return idx >= 0 ? probs[idx] ?? 0 : 0;
                  })
                  .reduce((s, p) => s + p, 0) / nextState.physical.roadStatuses.length
              : 0;

          // Hazard occurrence probability proxy (mean of Beta).
          const hazardOccurProbAvg =
            nextState.physical.hazards.length > 0
              ? nextState.physical.hazards
                  .map((h) => {
                    const a = h.occurrenceProbability.params.alpha;
                    const b = h.occurrenceProbability.params.beta;
                    const mean = a + b > 0 ? a / (a + b) : 0;
                    return mean;
                  })
                  .reduce((s, p) => s + p, 0) / nextState.physical.hazards.length
              : 0;

          const touchesRoad = (exposure?.roadIdsTouched?.length ?? 0) > 0;
          const touchesHazard = (exposure?.hazardTypesTouched?.length ?? 0) > 0;
          const roadExposureFactor = touchesRoad ? 1.35 : 1.0;
          const hazardExposureFactor = touchesHazard ? 1.3 : 1.0;

          const density = pf.avgSegmentsPerDay;
          const densityBonus = density >= 3 && density <= 5 ? 0.08 : density >= 2 && density <= 6 ? 0.04 : -0.02;

          const feasibilityRisk =
            0.45 * weatherRisk +
            0.35 * clamp01(roadClosedProbAvg * roadExposureFactor * (0.5 + fragility)) +
            0.25 * clamp01(hazardOccurProbAvg * hazardExposureFactor * (0.4 + fragility)) +
            0.25 * fragility;

          feasibilityProbability = clamp01(0.92 - feasibilityRisk);
          // Utility proxy: better when not fragile and weather/roads are favorable.
          estimatedUtility = clamp01(0.82 + densityBonus - 0.4 * fragility - 0.28 * weatherRisk - 0.18 * roadClosedProbAvg);

          if (weatherRisk > 0.35) constraintViolations.push('WEATHER_RISK');
          if (roadClosedProbAvg > 0.25) constraintViolations.push('ROAD_CLOSURE_RISK');
          if (hazardOccurProbAvg > 0.2) constraintViolations.push('HAZARD_RISK');
        }
        break;
      }
      case 'ADD_ACTIVITY':
      case 'REPLACE_ACTIVITY': {
        // 增加活动可能增加疲劳、影响可行性
        nextState.human.currentCumulativeFatigue = Math.min(
          1,
          nextState.human.currentCumulativeFatigue + 0.05,
        );
        feasibilityProbability = 0.75;
        estimatedUtility = 0.65;
        break;
      }
      case 'REMOVE_ACTIVITY':
      case 'ADJUST_PACE': {
        // 减少活动或调整节奏可能降低疲劳
        nextState.human.currentCumulativeFatigue = Math.max(
          0,
          nextState.human.currentCumulativeFatigue - 0.03,
        );
        feasibilityProbability = 0.85;
        estimatedUtility = 0.75;
        break;
      }
      case 'WEATHER_DEGRADATION': {
        // 天气恶化
        nextState.physical.weather.uncertaintyGrowthRate *= 1.2;
        constraintViolations.push('WEATHER_RISK');
        feasibilityProbability = 0.6;
        estimatedUtility = 0.5;
        break;
      }
      default: {
        // 通用：轻微不确定性增长
        nextState.physical.weather.uncertaintyGrowthRate *= 1.05;
      }
    }

    // Phase 2 研究级：当请求时返回 s_{t+1} ~ P_θ(s|s_t,a_t) 的采样
    const nextStateSamples =
      options?.includeSamples && options.includeSamples > 0
        ? this.sampleWorldState(nextState, options.includeSamples)
        : undefined;

    return {
      nextState,
      feasibilityProbability,
      constraintViolations,
      estimatedUtility,
      nextStateSamples,
    };
  }

  // ========== 贝叶斯更新实现 ==========

  private updateWeatherDistribution(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): void {
    const { variable, value } = observation.observation;
    const quality = observation.quality;
    
    // 更新权重：观测质量越高，权重越大
    const observationWeight = quality === 'HIGH' ? 0.7 
      : quality === 'LOW' ? 0.3 
      : 0.5;
    
    if (variable === 'windSpeed' && typeof value === 'number') {
      const prior = context.physical.weather.windSpeed;
      // 简化的贝叶斯更新：加权平均
      prior.params.mean = prior.params.mean * (1 - observationWeight) + value * observationWeight;
      prior.params.variance *= (1 - observationWeight * 0.5); // 观测减少不确定性
      prior.confidence = Math.min(0.95, prior.confidence + observationWeight * 0.1);
    }
    
    // 类似处理其他天气变量...
  }

  private updateRoadDistribution(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): void {
    const { variable: roadId, value: status } = observation.observation;
    
    const road = context.physical.roadStatuses.find(r => r.roadId === roadId);
    if (road && typeof status === 'string') {
      const statusIndex = ['OPEN', 'RESTRICTED', 'CLOSED'].indexOf(status);
      if (statusIndex >= 0) {
        // 增加观测状态的概率
        const probs = road.status.params.probabilities;
        const boost = observation.quality === 'HIGH' ? 0.3 : 0.15;
        probs[statusIndex] = Math.min(0.95, probs[statusIndex] + boost);
        
        // 归一化
        const sum = probs.reduce((a, b) => a + b, 0);
        for (let i = 0; i < probs.length; i++) {
          probs[i] /= sum;
        }
        
        road.status.confidence = Math.min(0.95, road.status.confidence + 0.1);
      }
    }
  }

  private updateHumanCapabilityDistribution(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): void {
    const { variable, value } = observation.observation;
    
    if (variable === 'actualDailyAscent' && typeof value === 'number') {
      const prior = context.human.maxDailyAscent;
      // 如果实际表现超出预期，提高均值
      const diff = value - prior.params.mean;
      prior.params.mean += diff * 0.2; // 保守更新
      prior.params.variance *= 0.9; // 减少不确定性
      
      // 记录校准历史
      // context.human.calibrationHistory?.push(...)
    }
  }

  private updateHazardDistribution(
    context: ProbabilisticWorldModelContext,
    observation: WorldStateObservation
  ): void {
    const { variable: hazardType, value: occurred } = observation.observation;
    
    const hazard = context.physical.hazards.find(h => h.type === hazardType);
    if (hazard) {
      // 更新发生概率
      const currentAlpha = hazard.occurrenceProbability.params.alpha;
      const currentBeta = hazard.occurrenceProbability.params.beta;
      
      if (occurred) {
        hazard.occurrenceProbability.params.alpha = currentAlpha + 1;
      } else {
        hazard.occurrenceProbability.params.beta = currentBeta + 1;
      }
    }
  }

  // ========== 采样方法 ==========

  private sampleGaussian(dist: GaussianDistribution): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return dist.params.mean + Math.sqrt(dist.params.variance) * z;
  }

  private sampleBeta(dist: BetaDistribution): number {
    const mean = dist.params.alpha / (dist.params.alpha + dist.params.beta);
    const variance = (dist.params.alpha * dist.params.beta) / 
      ((dist.params.alpha + dist.params.beta) ** 2 * (dist.params.alpha + dist.params.beta + 1));
    const sample = mean + Math.sqrt(variance) * (Math.random() * 2 - 1) * 2;
    return Math.max(0, Math.min(1, sample));
  }

  private sampleTruncatedNormal(dist: TruncatedNormalDistribution): number {
    for (let i = 0; i < 100; i++) {
      const sample = dist.params.mean + Math.sqrt(dist.params.variance) * (Math.random() * 2 - 1) * 3;
      if (sample >= dist.params.lower && sample <= dist.params.upper) {
        return sample;
      }
    }
    return dist.params.mean;
  }

  private sampleCategorical(dist: CategoricalDistribution): string {
    const r = Math.random();
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

  // ========== 辅助方法 ==========

  private getValueFromSample(sample: WorldStateSample, variable: string): any {
    if (variable.startsWith('weather.')) {
      const key = variable.replace('weather.', '');
      return (sample.weather as any)[key];
    }
    if (variable.startsWith('human.')) {
      const key = variable.replace('human.', '');
      return (sample.humanCapability as any)[key];
    }
    if (variable.startsWith('road.')) {
      const [, roadId] = variable.split('.');
      const road = sample.roadStatuses.find(r => r.roadId === roadId);
      return road?.status;
    }
    return null;
  }

  private checkCondition(value: any, operator: string, target: any): boolean {
    switch (operator) {
      case '=': return value === target;
      case '>': return value > target;
      case '<': return value < target;
      case '>=': return value >= target;
      case '<=': return value <= target;
      default: return false;
    }
  }
}
