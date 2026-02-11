// src/trips/decision/optimization/experiments/ab-testing.service.ts
/**
 * A/B 测试服务
 * 
 * 实现：
 * 1. 实验管理（创建、启动、停止）
 * 2. 用户分配
 * 3. 指标收集
 * 4. 统计分析
 * 5. 自动早停
 */

import { Injectable, Logger } from '@nestjs/common';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import {
  IABTestingService,
  ExperimentConfig,
  ExperimentVariant,
  ExperimentStatus,
  MetricDefinition,
  MetricObservation,
  UserAllocation,
  VariantStatistics,
  StatisticalTestResult,
  ExperimentAnalysis,
  AllocationStrategy,
} from './ab-testing.interface';

@Injectable()
export class ABTestingService implements IABTestingService {
  private readonly logger = new Logger(ABTestingService.name);
  
  // 存储（生产环境应使用数据库）
  private experiments: Map<string, ExperimentConfig> = new Map();
  private experimentStatus: Map<string, ExperimentStatus> = new Map();
  private userAllocations: Map<string, UserAllocation[]> = new Map(); // experimentId -> allocations
  private observations: Map<string, MetricObservation[]> = new Map(); // experimentId -> observations

  /**
   * 创建实验
   */
  async createExperiment(
    config: Omit<ExperimentConfig, 'experimentId' | 'createdAt'>
  ): Promise<ExperimentConfig> {
    const experimentId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 验证变体流量分配
    const totalAllocation = config.variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
    if (Math.abs(totalAllocation - 1) > 0.01) {
      throw new Error(`变体流量分配总和必须为 1，当前为 ${totalAllocation}`);
    }
    
    // 验证必须有对照组
    if (!config.variants.some(v => v.isControl)) {
      throw new Error('实验必须包含至少一个对照组');
    }
    
    const experiment: ExperimentConfig = {
      ...config,
      experimentId,
      createdAt: new Date().toISOString(),
    };
    
    this.experiments.set(experimentId, experiment);
    this.experimentStatus.set(experimentId, 'DRAFT');
    this.userAllocations.set(experimentId, []);
    this.observations.set(experimentId, []);
    
    this.logger.log(`[ABTesting] 创建实验: ${experiment.name} (${experimentId})`);
    
    return experiment;
  }

  /**
   * 启动实验
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }
    
    const status = this.experimentStatus.get(experimentId);
    if (status !== 'DRAFT' && status !== 'PAUSED') {
      throw new Error(`实验状态不允许启动: ${status}`);
    }
    
    this.experimentStatus.set(experimentId, 'RUNNING');
    this.logger.log(`[ABTesting] 启动实验: ${experiment.name}`);
  }

  /**
   * 暂停实验
   */
  async pauseExperiment(experimentId: string): Promise<void> {
    const status = this.experimentStatus.get(experimentId);
    if (status !== 'RUNNING') {
      throw new Error(`只能暂停运行中的实验: ${status}`);
    }
    
    this.experimentStatus.set(experimentId, 'PAUSED');
    this.logger.log(`[ABTesting] 暂停实验: ${experimentId}`);
  }

  /**
   * 停止实验
   */
  async stopExperiment(experimentId: string, reason: string): Promise<void> {
    const status = this.experimentStatus.get(experimentId);
    if (status === 'COMPLETED' || status === 'STOPPED') {
      throw new Error(`实验已结束: ${status}`);
    }
    
    this.experimentStatus.set(experimentId, 'STOPPED');
    this.logger.log(`[ABTesting] 停止实验: ${experimentId}, 原因: ${reason}`);
  }

  /**
   * 分配用户到变体
   */
  async allocateUser(experimentId: string, userId: string): Promise<UserAllocation> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }
    
    const status = this.experimentStatus.get(experimentId);
    if (status !== 'RUNNING') {
      throw new Error(`实验未运行: ${status}`);
    }
    
    // 检查是否已分配
    const allocations = this.userAllocations.get(experimentId) || [];
    const existing = allocations.find(a => a.userId === userId);
    if (existing) {
      return existing;
    }
    
    // 根据策略分配
    const variant = this.selectVariant(experiment, userId);
    
    const allocation: UserAllocation = {
      userId,
      experimentId,
      variantId: variant.variantId,
      allocatedAt: new Date().toISOString(),
      allocationMethod: experiment.allocationStrategy,
    };
    
    allocations.push(allocation);
    this.userAllocations.set(experimentId, allocations);
    
    this.logger.debug(`[ABTesting] 分配用户 ${userId} 到变体 ${variant.name}`);
    
    return allocation;
  }

  /**
   * 获取用户的变体
   */
  async getUserVariant(experimentId: string, userId: string): Promise<ExperimentVariant | null> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }
    
    const allocations = this.userAllocations.get(experimentId) || [];
    const allocation = allocations.find(a => a.userId === userId);
    
    if (!allocation) {
      return null;
    }
    
    return experiment.variants.find(v => v.variantId === allocation.variantId) || null;
  }

  /**
   * 记录指标观测
   */
  async recordObservation(
    observation: Omit<MetricObservation, 'observationId' | 'observedAt'>
  ): Promise<void> {
    const experiment = this.experiments.get(observation.experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${observation.experimentId}`);
    }
    
    // 验证指标存在
    if (!experiment.metrics.find(m => m.metricId === observation.metricId)) {
      throw new Error(`指标不存在: ${observation.metricId}`);
    }
    
    const fullObservation: MetricObservation = {
      ...observation,
      observationId: `obs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      observedAt: new Date().toISOString(),
    };
    
    const observations = this.observations.get(observation.experimentId) || [];
    observations.push(fullObservation);
    this.observations.set(observation.experimentId, observations);
    
    // 检查是否需要早停
    if (experiment.enableEarlyStopping) {
      const earlyStopCheck = await this.checkEarlyStopping(observation.experimentId);
      if (earlyStopCheck.shouldStop) {
        await this.stopExperiment(observation.experimentId, earlyStopCheck.reason || '早停条件满足');
      }
    }
  }

  /**
   * 分析实验
   */
  async analyzeExperiment(experimentId: string): Promise<ExperimentAnalysis> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }
    
    const observations = this.observations.get(experimentId) || [];
    const allocations = this.userAllocations.get(experimentId) || [];
    const status = this.experimentStatus.get(experimentId) || 'DRAFT';
    
    // 计算各变体统计
    const variantStatistics = this.calculateVariantStatistics(experiment, observations);
    
    // 进行统计检验
    const testResults = this.performStatisticalTests(experiment, variantStatistics, observations);
    
    // 生成推荐
    const { recommendation, reason, winningVariant } = this.generateRecommendation(
      experiment,
      testResults,
      variantStatistics,
    );
    
    // 计算进度
    const currentSampleSize = new Set(observations.map(o => o.userId)).size;
    const progress = {
      currentSampleSize,
      targetSampleSize: experiment.targetSampleSize,
      percentComplete: Math.min(100, (currentSampleSize / experiment.targetSampleSize) * 100),
    };
    
    return {
      experimentId,
      analyzedAt: new Date().toISOString(),
      status,
      variantStatistics,
      testResults,
      recommendation,
      recommendationReason: reason,
      winningVariant,
      progress,
    };
  }

  /**
   * 检查早停条件
   */
  async checkEarlyStopping(experimentId: string): Promise<{
    shouldStop: boolean;
    reason?: string;
    winningVariant?: string;
  }> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.enableEarlyStopping) {
      return { shouldStop: false };
    }
    
    const observations = this.observations.get(experimentId) || [];
    const minSamples = Math.max(100, experiment.targetSampleSize * 0.2);
    
    // 检查是否有足够样本
    const sampleSize = new Set(observations.map(o => o.userId)).size;
    if (sampleSize < minSamples) {
      return { shouldStop: false };
    }
    
    // 计算统计
    const variantStatistics = this.calculateVariantStatistics(experiment, observations);
    
    // 检查主要指标
    const primaryMetric = experiment.metrics.find(m => m.isPrimary);
    if (!primaryMetric) {
      return { shouldStop: false };
    }
    
    // 对主要指标进行检验
    const controlVariant = experiment.variants.find(v => v.isControl)!;
    const treatmentVariants = experiment.variants.filter(v => !v.isControl);
    
    for (const treatment of treatmentVariants) {
      const controlStats = variantStatistics.find(v => v.variantId === controlVariant.variantId);
      const treatmentStats = variantStatistics.find(v => v.variantId === treatment.variantId);
      
      if (!controlStats || !treatmentStats) continue;
      
      const controlMetric = controlStats.metrics[primaryMetric.metricId];
      const treatmentMetric = treatmentStats.metrics[primaryMetric.metricId];
      
      if (!controlMetric || !treatmentMetric) continue;
      
      // 简化的显著性检验
      const testResult = this.performTTest(
        controlMetric,
        treatmentMetric,
        experiment.significanceLevel,
      );
      
      // 非常显著且效应量大
      if (testResult.isSignificant && Math.abs(testResult.effectSize) > 0.5) {
        const winner = testResult.effectSize > 0 ? treatment.variantId : controlVariant.variantId;
        return {
          shouldStop: true,
          reason: `主要指标 ${primaryMetric.name} 显著差异 (p=${testResult.pValue.toFixed(4)}, effect=${testResult.effectSize.toFixed(2)})`,
          winningVariant: winner,
        };
      }
      
      // 明显无效果
      if (testResult.pValue > 0.5 && sampleSize > experiment.targetSampleSize * 0.5) {
        return {
          shouldStop: true,
          reason: `主要指标无显著差异，建议停止实验`,
        };
      }
    }
    
    return { shouldStop: false };
  }

  /**
   * 获取实验列表
   */
  async listExperiments(status?: ExperimentStatus): Promise<ExperimentConfig[]> {
    const experiments = Array.from(this.experiments.values());
    
    if (status) {
      return experiments.filter(e => this.experimentStatus.get(e.experimentId) === status);
    }
    
    return experiments;
  }

  /**
   * 获取实验详情
   */
  async getExperiment(experimentId: string): Promise<ExperimentConfig | null> {
    return this.experiments.get(experimentId) || null;
  }

  // ========== 私有方法 ==========

  /**
   * 选择变体
   */
  private selectVariant(experiment: ExperimentConfig, userId: string): ExperimentVariant {
    switch (experiment.allocationStrategy) {
      case 'RANDOM':
        return this.randomAllocation(experiment.variants);
      case 'DETERMINISTIC':
        return this.deterministicAllocation(experiment.variants, userId);
      case 'STRATIFIED':
      default:
        return this.randomAllocation(experiment.variants);
    }
  }

  /**
   * 随机分配
   */
  private randomAllocation(variants: ExperimentVariant[]): ExperimentVariant {
    const random = Math.random();
    let cumulative = 0;
    
    for (const variant of variants) {
      cumulative += variant.trafficAllocation;
      if (random < cumulative) {
        return variant;
      }
    }
    
    return variants[variants.length - 1];
  }

  /**
   * 确定性分配（基于用户 ID）
   */
  private deterministicAllocation(variants: ExperimentVariant[], userId: string): ExperimentVariant {
    // 使用用户 ID 的哈希值
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    const normalized = Math.abs(hash) / 2147483647;
    let cumulative = 0;
    
    for (const variant of variants) {
      cumulative += variant.trafficAllocation;
      if (normalized < cumulative) {
        return variant;
      }
    }
    
    return variants[variants.length - 1];
  }

  /**
   * 计算各变体统计
   */
  private calculateVariantStatistics(
    experiment: ExperimentConfig,
    observations: MetricObservation[],
  ): VariantStatistics[] {
    return experiment.variants.map(variant => {
      const variantObs = observations.filter(o => o.variantId === variant.variantId);
      const userIds = new Set(variantObs.map(o => o.userId));
      
      const metrics: VariantStatistics['metrics'] = {};
      
      for (const metric of experiment.metrics) {
        const metricObs = variantObs.filter(o => o.metricId === metric.metricId);
        const values = metricObs.map(o => o.value);
        
        if (values.length > 0) {
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
          const sorted = [...values].sort((a, b) => a - b);
          
          metrics[metric.metricId] = {
            mean,
            stdDev: Math.sqrt(variance),
            median: sorted[Math.floor(sorted.length / 2)],
            min: sorted[0],
            max: sorted[sorted.length - 1],
            count: values.length,
          };
        }
      }
      
      return {
        variantId: variant.variantId,
        sampleSize: userIds.size,
        metrics,
      };
    });
  }

  /**
   * 执行统计检验
   */
  private performStatisticalTests(
    experiment: ExperimentConfig,
    variantStatistics: VariantStatistics[],
    observations: MetricObservation[],
  ): ExperimentAnalysis['testResults'] {
    const results: ExperimentAnalysis['testResults'] = {};
    
    const controlVariant = experiment.variants.find(v => v.isControl);
    if (!controlVariant) return results;
    
    const controlStats = variantStatistics.find(v => v.variantId === controlVariant.variantId);
    if (!controlStats) return results;
    
    for (const metric of experiment.metrics) {
      results[metric.metricId] = [];
      
      const controlMetricStats = controlStats.metrics[metric.metricId];
      if (!controlMetricStats) continue;
      
      for (const variant of experiment.variants.filter(v => !v.isControl)) {
        const treatmentStats = variantStatistics.find(v => v.variantId === variant.variantId);
        if (!treatmentStats) continue;
        
        const treatmentMetricStats = treatmentStats.metrics[metric.metricId];
        if (!treatmentMetricStats) continue;
        
        const testResult = this.performTTest(
          controlMetricStats,
          treatmentMetricStats,
          experiment.significanceLevel,
        );
        
        results[metric.metricId].push({
          control: controlVariant.variantId,
          treatment: variant.variantId,
          result: testResult,
        });
      }
    }
    
    return results;
  }

  /**
   * 执行 T 检验
   */
  private performTTest(
    control: { mean: number; stdDev: number; count: number },
    treatment: { mean: number; stdDev: number; count: number },
    significanceLevel: number,
  ): StatisticalTestResult {
    const n1 = control.count;
    const n2 = treatment.count;
    const mean1 = control.mean;
    const mean2 = treatment.mean;
    const s1 = control.stdDev;
    const s2 = treatment.stdDev;
    
    // 合并标准误
    const pooledSE = Math.sqrt((s1 * s1 / n1) + (s2 * s2 / n2));
    
    // t 统计量
    const t = pooledSE > 0 ? (mean2 - mean1) / pooledSE : 0;
    
    // 自由度（Welch's）
    const df = Math.pow((s1 * s1 / n1) + (s2 * s2 / n2), 2) /
      (Math.pow(s1 * s1 / n1, 2) / (n1 - 1) + Math.pow(s2 * s2 / n2, 2) / (n2 - 1));
    
    // 近似 p 值（使用正态近似）
    const pValue = 2 * (1 - this.normalCDF(Math.abs(t)));
    
    // 效应量 (Cohen's d)
    const pooledStdDev = Math.sqrt(((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2));
    const effectSize = pooledStdDev > 0 ? (mean2 - mean1) / pooledStdDev : 0;
    
    // 相对提升
    const relativeUplift = mean1 !== 0 ? (mean2 - mean1) / mean1 : 0;
    
    // 置信区间
    const margin = 1.96 * pooledSE; // 95% CI
    
    return {
      testType: 'T_TEST',
      pValue,
      isSignificant: pValue < significanceLevel,
      effectSize,
      confidenceInterval: {
        lower: (mean2 - mean1) - margin,
        upper: (mean2 - mean1) + margin,
        level: 0.95,
      },
      relativeUplift,
      testStatistic: t,
      degreesOfFreedom: Math.round(df),
    };
  }

  /**
   * 标准正态分布 CDF
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    experiment: ExperimentConfig,
    testResults: ExperimentAnalysis['testResults'],
    variantStatistics: VariantStatistics[],
  ): { recommendation: ExperimentAnalysis['recommendation']; reason: string; winningVariant?: string } {
    const primaryMetric = experiment.metrics.find(m => m.isPrimary);
    if (!primaryMetric) {
      return { recommendation: 'INCONCLUSIVE', reason: '无主要指标' };
    }
    
    const primaryResults = testResults[primaryMetric.metricId] || [];
    
    // 检查是否有显著结果
    const significantResults = primaryResults.filter(r => r.result.isSignificant);
    
    if (significantResults.length === 0) {
      // 检查样本量
      const totalSamples = variantStatistics.reduce((sum, v) => sum + v.sampleSize, 0);
      if (totalSamples < experiment.targetSampleSize * 0.5) {
        return { recommendation: 'CONTINUE', reason: '样本量不足，继续收集数据' };
      }
      return { recommendation: 'STOP_NO_EFFECT', reason: '无显著差异，建议停止' };
    }
    
    // 找到最佳变体
    const bestResult = significantResults.reduce((best, current) => {
      const currentBetter = primaryMetric.direction === 'HIGHER_IS_BETTER'
        ? current.result.effectSize > best.result.effectSize
        : current.result.effectSize < best.result.effectSize;
      return currentBetter ? current : best;
    });
    
    const controlVariant = experiment.variants.find(v => v.isControl)!;
    const winner = bestResult.result.effectSize > 0 ? bestResult.treatment : controlVariant.variantId;
    
    return {
      recommendation: 'STOP_WINNER',
      reason: `变体 ${winner} 在主要指标上显著优于其他变体 (p=${bestResult.result.pValue.toFixed(4)})`,
      winningVariant: winner,
    };
  }
}
