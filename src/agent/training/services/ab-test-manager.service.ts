// src/agent/training/services/ab-test-manager.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ABTestExperiment,
  ABTestAssignment,
  ABTestResult,
  GradualRolloutPhase,
} from '../interfaces/product.interface';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

/**
 * ABTestManagerService
 * 
 * 职责：设计A/B实验、灰度节奏、上线标准
 * 
 * 功能：
 * 1. createExperiment() - 创建A/B实验
 * 2. assignToGroup() - 分配用户到实验组
 * 3. analyzeResults() - 分析实验结果
 */
@Injectable()
export class ABTestManagerService {
  private readonly logger = new Logger(ABTestManagerService.name);
  private readonly experiments: Map<string, ABTestExperiment> = new Map();
  private readonly assignments: Map<string, ABTestAssignment> = new Map();
  private readonly defaultRolloutPhases: GradualRolloutPhase[] = [
    {
      phase: 1,
      traffic_percentage: 10,
      duration_days: 3,
      success_criteria: {
        min_success_rate: 0.95,
        max_error_rate: 0.05,
      },
    },
    {
      phase: 2,
      traffic_percentage: 25,
      duration_days: 3,
      success_criteria: {
        min_success_rate: 0.95,
        max_error_rate: 0.05,
      },
    },
    {
      phase: 3,
      traffic_percentage: 50,
      duration_days: 3,
      success_criteria: {
        min_success_rate: 0.95,
        max_error_rate: 0.05,
      },
    },
    {
      phase: 4,
      traffic_percentage: 100,
      duration_days: 0, // 持续
      success_criteria: {},
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建A/B实验
   */
  async createExperiment(
    name: string,
    description: string,
    variants: Array<{
      name: string;
      model_version: string;
      traffic_percentage: number;
    }>,
    successMetrics: string[],
  ): Promise<ABTestExperiment> {
    this.logger.log(`[ABTestManager] 创建A/B实验: name=${name}`);

    // 验证流量分配总和为100%
    const totalTraffic = variants.reduce(
      (sum, v) => sum + v.traffic_percentage,
      0,
    );
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(
        `Traffic percentages must sum to 100%, got ${totalTraffic}%`,
      );
    }

    const experiment: ABTestExperiment = {
      experiment_id: `exp_${randomUUID()}`,
      name,
      description,
      variants: variants.map((v, index) => ({
        variant_id: `variant_${index + 1}`,
        name: v.name,
        model_version: v.model_version,
        traffic_percentage: v.traffic_percentage,
      })),
      start_date: new Date().toISOString(),
      status: 'DRAFT',
      success_metrics: successMetrics,
      created_at: new Date().toISOString(),
    };

    this.experiments.set(experiment.experiment_id, experiment);

    this.logger.log(
      `[ABTestManager] A/B实验已创建: experimentId=${experiment.experiment_id}`,
    );

    return experiment;
  }

  /**
   * 启动实验
   */
  async startExperiment(experimentId: string): Promise<void> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    experiment.status = 'RUNNING';
    this.logger.log(`[ABTestManager] 实验已启动: experimentId=${experimentId}`);
  }

  /**
   * 分配用户到实验组（一致性哈希）
   */
  async assignToGroup(
    experimentId: string,
    requestId: string,
    userId?: string,
  ): Promise<ABTestAssignment> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (experiment.status !== 'RUNNING') {
      throw new Error(`Experiment is not running: ${experiment.status}`);
    }

    // 使用一致性哈希分配
    const hashInput = userId || requestId;
    const hash = this.consistentHash(hashInput, experimentId);
    const bucket = hash % 100; // 0-99

    // 根据流量百分比分配
    let cumulativePercentage = 0;
    let assignedVariant = experiment.variants[0]; // 默认第一个

    for (const variant of experiment.variants) {
      cumulativePercentage += variant.traffic_percentage;
      if (bucket < cumulativePercentage) {
        assignedVariant = variant;
        break;
      }
    }

    const assignment: ABTestAssignment = {
      experiment_id: experimentId,
      variant_id: assignedVariant.variant_id,
      user_id: userId,
      request_id: requestId,
      assignment_method: 'CONSISTENT_HASH',
      timestamp: new Date().toISOString(),
    };

    const assignmentKey = `${experimentId}_${requestId}`;
    this.assignments.set(assignmentKey, assignment);

    this.logger.debug(
      `[ABTestManager] 用户已分配到实验组: experimentId=${experimentId}, variantId=${assignedVariant.variant_id}`,
    );

    return assignment;
  }

  /**
   * 分析实验结果
   */
  async analyzeResults(
    experimentId: string,
    variantMetrics: Array<{
      variant_id: string;
      sample_size: number;
      success_count: number;
      total_reward: number;
      total_latency_ms: number;
      error_count: number;
    }>,
  ): Promise<ABTestResult> {
    this.logger.log(`[ABTestManager] 分析实验结果: experimentId=${experimentId}`);

    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // 计算各变体的指标
    const variantResults = variantMetrics.map((m) => ({
      variant_id: m.variant_id,
      sample_size: m.sample_size,
      success_rate: m.sample_size > 0 ? m.success_count / m.sample_size : 0,
      avg_reward:
        m.sample_size > 0 ? m.total_reward / m.sample_size : 0,
      avg_latency_ms:
        m.sample_size > 0 ? m.total_latency_ms / m.sample_size : 0,
      error_rate: m.sample_size > 0 ? m.error_count / m.sample_size : 0,
    }));

    // 计算统计显著性（简化实现：t-test）
    const statisticalSignificance = this.calculateStatisticalSignificance(
      variantResults,
    );

    // 确定获胜变体
    const winnerVariant = variantResults.reduce((best, current) => {
      const bestScore =
        best.success_rate * 0.5 + best.avg_reward * 0.3 - best.error_rate * 0.2;
      const currentScore =
        current.success_rate * 0.5 +
        current.avg_reward * 0.3 -
        current.error_rate * 0.2;
      return currentScore > bestScore ? current : best;
    });

    const result: ABTestResult = {
      experiment_id: experimentId,
      variant_results: variantResults,
      statistical_significance: {
        ...statisticalSignificance,
        winner_variant_id:
          statisticalSignificance.is_significant
            ? winnerVariant.variant_id
            : undefined,
      },
      analysis_date: new Date().toISOString(),
    };

    this.logger.log(
      `[ABTestManager] 实验结果分析完成: winnerVariant=${result.statistical_significance.winner_variant_id || 'N/A'}`,
    );

    return result;
  }

  /**
   * 一致性哈希
   */
  private consistentHash(input: string, salt: string): number {
    const hashInput = `${salt}:${input}`;
    const hash = createHash('md5').update(hashInput).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * 计算统计显著性（简化实现）
   */
  private calculateStatisticalSignificance(
    variantResults: ABTestResult['variant_results'],
  ): { p_value: number; is_significant: boolean } {
    // 简化实现：假设p-value为0.05
    // 实际实现应该使用t-test或卡方检验
    if (variantResults.length < 2) {
      return { p_value: 1.0, is_significant: false };
    }

    // 检查是否有显著差异（简化：比较success_rate）
    const rates = variantResults.map((v) => v.success_rate);
    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const diff = maxRate - minRate;

    // 如果差异大于5%且样本量足够，认为显著
    const isSignificant = diff > 0.05 && variantResults.every((v) => v.sample_size >= 100);

    return {
      p_value: isSignificant ? 0.05 : 0.5,
      is_significant: isSignificant,
    };
  }

  /**
   * 获取实验
   */
  getExperiment(experimentId: string): ABTestExperiment | undefined {
    return this.experiments.get(experimentId);
  }

  /**
   * 列出所有实验
   */
  listExperiments(status?: ABTestExperiment['status']): ABTestExperiment[] {
    let experiments = Array.from(this.experiments.values());

    if (status) {
      experiments = experiments.filter((e) => e.status === status);
    }

    return experiments.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  /**
   * 获取灰度阶段配置
   */
  getRolloutPhases(): GradualRolloutPhase[] {
    return [...this.defaultRolloutPhases];
  }
}
