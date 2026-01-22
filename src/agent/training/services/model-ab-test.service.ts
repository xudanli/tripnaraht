// src/agent/training/services/model-ab-test.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ModelRegistryService } from './model-registry.service';
import { EvalSuiteService } from './eval-suite.service';
import { ABTestManagerService } from './ab-test-manager.service';

/**
 * ModelABTestService
 * 
 * 职责：模型版本的 A/B 测试框架
 * 
 * 功能：
 * 1. 创建模型版本对比实验
 * 2. 分配流量到不同模型版本
 * 3. 收集性能指标
 * 4. 对比分析结果
 * 5. 决定是否推广新版本
 */
@Injectable()
export class ModelABTestService {
  private readonly logger = new Logger(ModelABTestService.name);

  constructor(
    private readonly modelRegistry: ModelRegistryService,
    private readonly evalSuite: EvalSuiteService,
    private readonly abTestManager: ABTestManagerService,
  ) {}

  /**
   * 创建模型版本对比实验
   */
  async createModelVersionExperiment(options: {
    name: string;
    description: string;
    controlVersion: string; // 对照组版本（当前生产版本）
    treatmentVersion: string; // 实验组版本（新版本）
    trafficSplit?: { control: number; treatment: number }; // 流量分配，默认 50/50
    successMetrics: string[]; // 成功指标，如 ['accuracy', 'latency', 'user_satisfaction']
    minSampleSize?: number; // 最小样本量
    durationDays?: number; // 实验持续时间（天）
  }): Promise<{
    experimentId: string;
    status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    controlVersion: string;
    treatmentVersion: string;
  }> {
    this.logger.log(
      `[ModelABTest] 创建模型版本对比实验: controlVersion=${options.controlVersion}, treatmentVersion=${options.treatmentVersion}`,
    );

    // 验证模型版本存在
    const controlModel = await this.modelRegistry.getModelVersion(options.controlVersion);
    const treatmentModel = await this.modelRegistry.getModelVersion(options.treatmentVersion);

    if (!controlModel) {
      throw new Error(`Control model version not found: ${options.controlVersion}`);
    }
    if (!treatmentModel) {
      throw new Error(`Treatment model version not found: ${options.treatmentVersion}`);
    }

    // 创建 A/B 实验
    const trafficSplit = options.trafficSplit || { control: 50, treatment: 50 };
    const experiment = await this.abTestManager.createExperiment(
      options.name,
      options.description,
      [
        {
          name: 'control',
          model_version: options.controlVersion,
          traffic_percentage: trafficSplit.control,
        },
        {
          name: 'treatment',
          model_version: options.treatmentVersion,
          traffic_percentage: trafficSplit.treatment,
        },
      ],
      options.successMetrics,
    );

    this.logger.log(
      `[ModelABTest] 模型版本对比实验已创建: experimentId=${experiment.experiment_id}`,
    );

    return {
      experimentId: experiment.experiment_id,
      status: 'CREATED',
      controlVersion: options.controlVersion,
      treatmentVersion: options.treatmentVersion,
    };
  }

  /**
   * 分析模型版本对比结果
   */
  async analyzeModelVersionComparison(
    experimentId: string,
    controlVersion: string,
    treatmentVersion: string,
  ): Promise<{
    experimentId: string;
    controlMetrics: Record<string, number>;
    treatmentMetrics: Record<string, number>;
    improvement: Record<string, { absolute: number; percentage: number }>;
    statisticalSignificance: Record<string, { pValue: number; significant: boolean }>;
    recommendation: 'PROMOTE' | 'REJECT' | 'CONTINUE';
    reasoning: string;
  }> {
    this.logger.log(
      `[ModelABTest] 分析模型版本对比: experimentId=${experimentId}, controlVersion=${controlVersion}, treatmentVersion=${treatmentVersion}`,
    );

    // 获取实验的变体指标（需要从 A/B 测试管理器获取）
    // 注意：实际实现中，这些指标应该从 A/B 测试运行时收集的数据中获取
    // 这里使用模拟数据作为占位符
    const variantMetrics = [
      {
        variant_id: 'control',
        sample_size: 100,
        success_count: 85,
        total_reward: 850,
        total_latency_ms: 5000,
        error_count: 5,
      },
      {
        variant_id: 'treatment',
        sample_size: 100,
        success_count: 90,
        total_reward: 900,
        total_latency_ms: 4800,
        error_count: 3,
      },
    ];

    // 获取实验结果
    const experimentResult = await this.abTestManager.analyzeResults(experimentId, variantMetrics);

    // 获取模型评估指标（使用完整流程评估）
    const controlEval = await this.evalSuite.evaluateFullPipeline(controlVersion);
    const treatmentEval = await this.evalSuite.evaluateFullPipeline(treatmentVersion);

    // 合并指标（实验指标 + 评估指标）
    const controlVariant = experimentResult.variant_results.find((v) => v.variant_id === 'control');
    const treatmentVariant = experimentResult.variant_results.find((v) => v.variant_id === 'treatment');

    const controlMetrics: Record<string, number> = {
      success_rate: controlVariant?.success_rate || 0,
      avg_reward: controlVariant?.avg_reward || 0,
      avg_latency_ms: controlVariant?.avg_latency_ms || 0,
      error_rate: controlVariant?.error_rate || 0,
      overall_score: controlEval.overall_score || 0,
      router_accuracy: controlEval.router_result?.accuracy || 0,
      gate_accuracy: controlEval.gate_result?.accuracy || 0,
      itinerary_success_rate: controlEval.itinerary_result?.success_rate || 0,
    };

    const treatmentMetrics: Record<string, number> = {
      success_rate: treatmentVariant?.success_rate || 0,
      avg_reward: treatmentVariant?.avg_reward || 0,
      avg_latency_ms: treatmentVariant?.avg_latency_ms || 0,
      error_rate: treatmentVariant?.error_rate || 0,
      overall_score: treatmentEval.overall_score || 0,
      router_accuracy: treatmentEval.router_result?.accuracy || 0,
      gate_accuracy: treatmentEval.gate_result?.accuracy || 0,
      itinerary_success_rate: treatmentEval.itinerary_result?.success_rate || 0,
    };

    // 计算改进
    const improvement: Record<string, { absolute: number; percentage: number }> = {};
    const allMetrics = new Set([...Object.keys(controlMetrics), ...Object.keys(treatmentMetrics)]);

    for (const metric of allMetrics) {
      const controlValue = controlMetrics[metric] || 0;
      const treatmentValue = treatmentMetrics[metric] || 0;
      const absolute = treatmentValue - controlValue;
      const percentage = controlValue !== 0 ? (absolute / controlValue) * 100 : 0;

      improvement[metric] = { absolute, percentage };
    }

    // 计算统计显著性（简化版，实际应该使用 t-test 或 Mann-Whitney U test）
    const statisticalSignificance: Record<string, { pValue: number; significant: boolean }> = {};
    for (const metric of allMetrics) {
      // 简化：假设样本量足够大，使用 z-test
      // 实际实现应该使用真实的统计测试
      const controlValue = controlMetrics[metric] || 0;
      const treatmentValue = treatmentMetrics[metric] || 0;
      const pValue = this.calculatePValue(controlValue, treatmentValue, 1000, 1000); // 假设样本量
      statisticalSignificance[metric] = {
        pValue,
        significant: pValue < 0.05, // 95% 置信度
      };
    }

    // 生成推荐
    const recommendation = this.generateRecommendation(
      improvement,
      statisticalSignificance,
      experimentResult,
    );

    return {
      experimentId,
      controlMetrics,
      treatmentMetrics,
      improvement,
      statisticalSignificance,
      recommendation: recommendation.recommendation,
      reasoning: recommendation.reasoning,
    };
  }

  /**
   * 计算 p-value（简化版）
   */
  private calculatePValue(
    controlMean: number,
    treatmentMean: number,
    controlSampleSize: number,
    treatmentSampleSize: number,
  ): number {
    // 简化实现：假设正态分布，使用 z-test
    // 实际实现应该使用真实的统计测试库
    const pooledStd = Math.sqrt(
      (1 / controlSampleSize + 1 / treatmentSampleSize) * 0.1, // 假设标准差为 0.1
    );
    const z = (treatmentMean - controlMean) / pooledStd;
    
    // 简化的 p-value 计算（实际应该使用标准正态分布表）
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
    return Math.max(0, Math.min(1, pValue));
  }

  /**
   * 标准正态分布累积分布函数（简化版）
   */
  private normalCDF(x: number): number {
    // 使用误差函数的近似
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * 误差函数（简化版）
   */
  private erf(x: number): number {
    // 使用近似公式
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    improvement: Record<string, { absolute: number; percentage: number }>,
    statisticalSignificance: Record<string, { pValue: number; significant: boolean }>,
    experimentResult: any,
  ): { recommendation: 'PROMOTE' | 'REJECT' | 'CONTINUE'; reasoning: string } {
    // 检查关键指标
    const keyMetrics = ['accuracy', 'success_rate', 'user_satisfaction'];
    let positiveImprovements = 0;
    let significantImprovements = 0;
    let negativeImprovements = 0;

    for (const metric of keyMetrics) {
      if (improvement[metric]) {
        if (improvement[metric].percentage > 0) {
          positiveImprovements++;
          if (statisticalSignificance[metric]?.significant) {
            significantImprovements++;
          }
        } else if (improvement[metric].percentage < -5) {
          // 如果下降超过 5%，认为是负面改进
          negativeImprovements++;
        }
      }
    }

    // 决策逻辑
    if (negativeImprovements > 0) {
      return {
        recommendation: 'REJECT',
        reasoning: `新版本在 ${negativeImprovements} 个关键指标上表现更差，建议拒绝`,
      };
    }

    if (significantImprovements >= 2) {
      return {
        recommendation: 'PROMOTE',
        reasoning: `新版本在 ${significantImprovements} 个关键指标上显著改进，建议推广`,
      };
    }

    if (positiveImprovements > 0) {
      return {
        recommendation: 'CONTINUE',
        reasoning: `新版本有改进但统计显著性不足，建议继续实验`,
      };
    }

    return {
      recommendation: 'CONTINUE',
      reasoning: '实验结果不明确，建议继续实验',
    };
  }

  /**
   * 推广模型版本（如果 A/B 测试通过）
   */
  async promoteModelVersion(
    experimentId: string,
    treatmentVersion: string,
  ): Promise<void> {
    this.logger.log(
      `[ModelABTest] 推广模型版本: experimentId=${experimentId}, treatmentVersion=${treatmentVersion}`,
    );

    // 分析结果
    const analysis = await this.analyzeModelVersionComparison(
      experimentId,
      '', // 需要从实验获取 control version
      treatmentVersion,
    );

    if (analysis.recommendation !== 'PROMOTE') {
      throw new Error(
        `模型版本未通过 A/B 测试，不能推广: recommendation=${analysis.recommendation}, reasoning=${analysis.reasoning}`,
      );
    }

    // 设置为生产版本
    await this.modelRegistry.setProductionVersion(treatmentVersion);

    this.logger.log(`[ModelABTest] 模型版本已推广: treatmentVersion=${treatmentVersion}`);
  }
}
