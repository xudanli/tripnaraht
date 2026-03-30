/**
 * A/B 测试服务
 *
 * 实现 IABTestingService 接口
 * 支持实验配置、用户分配、指标收集和统计分析
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  IABTestingService,
  ExperimentConfig,
  ExperimentStatus,
  ExperimentVariant,
  UserAllocation,
  MetricObservation,
  ExperimentAnalysis,
  VariantStatistics,
  StatisticalTestResult,
} from './ab-testing.interface';

@Injectable()
export class ABTestingService implements IABTestingService {
  private readonly logger = new Logger(ABTestingService.name);

  private experiments: Map<string, ExperimentConfig> = new Map();
  private allocations: Map<string, UserAllocation[]> = new Map();
  private observations: Map<string, MetricObservation[]> = new Map();

  /**
   * 创建实验
   */
  async createExperiment(
    config: Omit<ExperimentConfig, 'experimentId' | 'createdAt'>,
  ): Promise<ExperimentConfig> {
    const experimentId = `exp_${uuidv4()}`;
    const now = new Date().toISOString();

    const experiment: ExperimentConfig = {
      ...config,
      experimentId,
      createdAt: now,
    };

    this.experiments.set(experimentId, experiment);
    this.allocations.set(experimentId, []);
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

    if (experiment.status !== 'DRAFT' && experiment.status !== 'PAUSED') {
      throw new Error(`无法启动状态为 ${experiment.status} 的实验`);
    }

    experiment.status = 'RUNNING';
    this.logger.log(`[ABTesting] 启动实验: ${experiment.name}`);
  }

  /**
   * 暂停实验
   */
  async pauseExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    if (experiment.status !== 'RUNNING') {
      throw new Error(`只能暂停运行中的实验`);
    }

    experiment.status = 'PAUSED';
    this.logger.log(`[ABTesting] 暂停实验: ${experiment.name}`);
  }

  /**
   * 停止实验
   */
  async stopExperiment(experimentId: string, reason: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    experiment.status = 'STOPPED';
    this.logger.log(`[ABTesting] 停止实验: ${experiment.name}, 原因: ${reason}`);
  }

  /**
   * 完成实验
   */
  async completeExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    experiment.status = 'COMPLETED';
    this.logger.log(`[ABTesting] 完成实验: ${experiment.name}`);
  }

  /**
   * 分配用户到变体
   */
  async allocateUser(experimentId: string, userId: string): Promise<UserAllocation> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`实验不存在: ${experimentId}`);
    }

    if (experiment.status !== 'RUNNING') {
      throw new Error(`实验未运行，无法分配用户`);
    }

    const existingAllocations = this.allocations.get(experimentId) || [];
    const existing = existingAllocations.find((a) => a.userId === userId);
    if (existing) {
      return existing;
    }

    const variant = this.selectVariant(experiment, userId);

    const allocation: UserAllocation = {
      userId,
      experimentId,
      variantId: variant.variantId,
      allocatedAt: new Date().toISOString(),
      allocationMethod: experiment.allocationStrategy,
    };

    existingAllocations.push(allocation);
    this.allocations.set(experimentId, existingAllocations);

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

    const allocations = this.allocations.get(experimentId) || [];
    const allocation = allocations.find((a) => a.userId === userId);

    if (!allocation) {
      return null;
    }

    return experiment.variants.find((v) => v.variantId === allocation.variantId) || null;
  }

  /**
   * 记录指标观测
   */
  async recordObservation(
    observation: Omit<MetricObservation, 'observationId' | 'observedAt'>,
  ): Promise<void> {
    const fullObservation: MetricObservation = {
      ...observation,
      observationId: `obs_${uuidv4()}`,
      observedAt: new Date().toISOString(),
    };

    const experimentObservations = this.observations.get(observation.experimentId) || [];
    experimentObservations.push(fullObservation);
    this.observations.set(observation.experimentId, experimentObservations);
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
    const allocations = this.allocations.get(experimentId) || [];

    const variantStatistics = this.computeVariantStatistics(experiment, observations);
    const testResults = this.computeTestResults(experiment, variantStatistics);
    const { recommendation, winningVariant, recommendationReason } = this.determineRecommendation(
      experiment,
      testResults,
      allocations.length,
    );

    const currentSampleSize = allocations.length;
    const percentComplete = Math.min(
      100,
      (currentSampleSize / experiment.targetSampleSize) * 100,
    );

    return {
      experimentId,
      analyzedAt: new Date().toISOString(),
      status: experiment.status,
      variantStatistics,
      testResults,
      recommendation,
      recommendationReason,
      winningVariant,
      progress: {
        currentSampleSize,
        targetSampleSize: experiment.targetSampleSize,
        percentComplete,
      },
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

    const analysis = await this.analyzeExperiment(experimentId);
    const threshold = experiment.earlyStoppingThreshold ?? 0.01;

    for (const metric of experiment.metrics) {
      if (!metric.isPrimary) continue;

      const metricResults = analysis.testResults[metric.metricId];
      if (!metricResults?.length) continue;

      for (const test of metricResults) {
        if (test.result.pValue < threshold && test.result.isSignificant) {
          const winner = test.result.effectSize > 0 ? test.treatment : test.control;
          return {
            shouldStop: true,
            reason: `主要指标 ${metric.name} 达到显著性阈值 (p=${test.result.pValue.toFixed(4)})`,
            winningVariant: winner,
          };
        }
      }
    }

    if (analysis.progress.percentComplete >= 100) {
      return {
        shouldStop: true,
        reason: '已达到目标样本量',
        winningVariant: analysis.winningVariant,
      };
    }

    return { shouldStop: false };
  }

  /**
   * 获取实验列表
   */
  async listExperiments(status?: ExperimentStatus): Promise<ExperimentConfig[]> {
    const all = Array.from(this.experiments.values());
    if (status) {
      return all.filter((e) => e.status === status);
    }
    return all;
  }

  /**
   * 获取实验详情
   */
  async getExperiment(experimentId: string): Promise<ExperimentConfig | null> {
    return this.experiments.get(experimentId) || null;
  }

  // ========== 私有方法 ==========

  private selectVariant(experiment: ExperimentConfig, userId: string): ExperimentVariant {
    switch (experiment.allocationStrategy) {
      case 'DETERMINISTIC':
        return this.deterministicAllocation(experiment.variants, userId);
      case 'STRATIFIED':
        return this.stratifiedAllocation(experiment.variants, userId);
      case 'RANDOM':
      default:
        return this.randomAllocation(experiment.variants);
    }
  }

  private deterministicAllocation(variants: ExperimentVariant[], userId: string): ExperimentVariant {
    const hash = this.hashString(userId);
    const bucket = hash % 100;

    let cumulative = 0;
    for (const variant of variants) {
      cumulative += variant.trafficAllocation * 100;
      if (bucket < cumulative) {
        return variant;
      }
    }

    return variants[0];
  }

  private stratifiedAllocation(variants: ExperimentVariant[], userId: string): ExperimentVariant {
    return this.deterministicAllocation(variants, userId);
  }

  private randomAllocation(variants: ExperimentVariant[]): ExperimentVariant {
    const random = Math.random();
    let cumulative = 0;

    for (const variant of variants) {
      cumulative += variant.trafficAllocation;
      if (random < cumulative) {
        return variant;
      }
    }

    return variants[0];
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private computeVariantStatistics(
    experiment: ExperimentConfig,
    observations: MetricObservation[],
  ): VariantStatistics[] {
    return experiment.variants.map((variant) => {
      const variantObs = observations.filter((o) => o.variantId === variant.variantId);

      const metrics: VariantStatistics['metrics'] = {};

      for (const metric of experiment.metrics) {
        const metricObs = variantObs.filter((o) => o.metricId === metric.metricId);
        const values = metricObs.map((o) => o.value);

        if (values.length === 0) {
          metrics[metric.metricId] = {
            mean: 0,
            stdDev: 0,
            median: 0,
            min: 0,
            max: 0,
            count: 0,
          };
        } else {
          const sorted = [...values].sort((a, b) => a - b);
          const mean = values.reduce((a, b) => a + b, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

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
        sampleSize: variantObs.length,
        metrics,
      };
    });
  }

  private computeTestResults(
    experiment: ExperimentConfig,
    variantStats: VariantStatistics[],
  ): ExperimentAnalysis['testResults'] {
    const results: ExperimentAnalysis['testResults'] = {};
    const control = experiment.variants.find((v) => v.isControl);

    if (!control) {
      return results;
    }

    const controlStats = variantStats.find((s) => s.variantId === control.variantId);

    for (const metric of experiment.metrics) {
      results[metric.metricId] = [];

      for (const variant of experiment.variants) {
        if (variant.isControl) continue;

        const treatmentStats = variantStats.find((s) => s.variantId === variant.variantId);

        if (controlStats && treatmentStats) {
          const testResult = this.performTTest(
            controlStats.metrics[metric.metricId],
            treatmentStats.metrics[metric.metricId],
            experiment.significanceLevel,
            metric.direction,
          );

          results[metric.metricId].push({
            control: control.variantId,
            treatment: variant.variantId,
            result: testResult,
          });
        }
      }
    }

    return results;
  }

  private performTTest(
    control: VariantStatistics['metrics'][string],
    treatment: VariantStatistics['metrics'][string],
    significanceLevel: number,
    direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER',
  ): StatisticalTestResult {
    const n1 = control.count;
    const n2 = treatment.count;

    if (n1 < 2 || n2 < 2) {
      return {
        testType: 'T_TEST',
        pValue: 1,
        isSignificant: false,
        effectSize: 0,
        confidenceInterval: { lower: 0, upper: 0, level: 1 - significanceLevel },
        relativeUplift: 0,
        testStatistic: 0,
        degreesOfFreedom: 0,
      };
    }

    const mean1 = control.mean;
    const mean2 = treatment.mean;
    const std1 = control.stdDev;
    const std2 = treatment.stdDev;

    const pooledSE = Math.sqrt((std1 * std1) / n1 + (std2 * std2) / n2);

    if (pooledSE === 0) {
      return {
        testType: 'T_TEST',
        pValue: mean1 === mean2 ? 1 : 0,
        isSignificant: mean1 !== mean2,
        effectSize: 0,
        confidenceInterval: { lower: mean2 - mean1, upper: mean2 - mean1, level: 1 - significanceLevel },
        relativeUplift: mean1 !== 0 ? (mean2 - mean1) / Math.abs(mean1) : 0,
        testStatistic: 0,
        degreesOfFreedom: n1 + n2 - 2,
      };
    }

    const tStatistic = (mean2 - mean1) / pooledSE;
    const df = n1 + n2 - 2;
    const pValue = 2 * (1 - this.tCDF(Math.abs(tStatistic), df));

    const pooledStd = Math.sqrt(((n1 - 1) * std1 * std1 + (n2 - 1) * std2 * std2) / df);
    const effectSize = pooledStd > 0 ? (mean2 - mean1) / pooledStd : 0;

    const tCritical = this.tInverseCDF(1 - significanceLevel / 2, df);
    const marginOfError = tCritical * pooledSE;

    const relativeUplift = mean1 !== 0 ? (mean2 - mean1) / Math.abs(mean1) : 0;

    let isSignificant = pValue < significanceLevel;
    if (direction === 'HIGHER_IS_BETTER') {
      isSignificant = isSignificant && mean2 > mean1;
    } else {
      isSignificant = isSignificant && mean2 < mean1;
    }

    return {
      testType: 'T_TEST',
      pValue,
      isSignificant,
      effectSize,
      confidenceInterval: {
        lower: (mean2 - mean1) - marginOfError,
        upper: (mean2 - mean1) + marginOfError,
        level: 1 - significanceLevel,
      },
      relativeUplift,
      testStatistic: tStatistic,
      degreesOfFreedom: df,
    };
  }

  private tCDF(t: number, df: number): number {
    const x = df / (df + t * t);
    return 1 - 0.5 * this.incompleteBeta(df / 2, 0.5, x);
  }

  private tInverseCDF(p: number, df: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;

    let low = -10;
    let high = 10;

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const cdf = this.tCDF(mid, df);

      if (Math.abs(cdf - p) < 1e-10) {
        return mid;
      }

      if (cdf < p) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  }

  private incompleteBeta(a: number, b: number, x: number): number {
    if (x === 0) return 0;
    if (x === 1) return 1;

    let sum = 0;
    let term = 1;

    for (let n = 0; n < 1000; n++) {
      term *= (a + n) * x / (a + b + n);
      sum += term / (a + n + 1);

      if (Math.abs(term) < 1e-10) break;
    }

    return Math.pow(x, a) * Math.pow(1 - x, b) * sum * this.gamma(a + b) / (this.gamma(a) * this.gamma(b));
  }

  private gamma(z: number): number {
    const g = 7;
    const c = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7,
    ];

    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this.gamma(1 - z));
    }

    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
      x += c[i] / (z + i);
    }

    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  private determineRecommendation(
    experiment: ExperimentConfig,
    testResults: ExperimentAnalysis['testResults'],
    sampleSize: number,
  ): { recommendation: ExperimentAnalysis['recommendation']; winningVariant?: string; recommendationReason: string } {
    const primaryMetric = experiment.metrics.find((m) => m.isPrimary);

    if (!primaryMetric) {
      return {
        recommendation: 'INCONCLUSIVE',
        recommendationReason: '未定义主要指标',
      };
    }

    const results = testResults[primaryMetric.metricId];

    if (!results?.length) {
      return {
        recommendation: 'CONTINUE',
        recommendationReason: '数据不足',
      };
    }

    const significantResults = results.filter((r) => r.result.isSignificant);

    if (significantResults.length > 0) {
      const best = significantResults.reduce((prev, curr) =>
        Math.abs(curr.result.effectSize) > Math.abs(prev.result.effectSize) ? curr : prev,
      );

      const winner = best.result.effectSize > 0 ? best.treatment : best.control;

      return {
        recommendation: 'STOP_WINNER',
        winningVariant: winner,
        recommendationReason: `变体 ${winner} 在主要指标上显著优于其他变体 (p=${best.result.pValue.toFixed(4)}, 效应量=${best.result.effectSize.toFixed(3)})`,
      };
    }

    if (sampleSize >= experiment.targetSampleSize) {
      return {
        recommendation: 'STOP_NO_EFFECT',
        recommendationReason: '已达到目标样本量，但未检测到显著差异',
      };
    }

    return {
      recommendation: 'CONTINUE',
      recommendationReason: `样本量 ${sampleSize}/${experiment.targetSampleSize}，继续收集数据`,
    };
  }
}
