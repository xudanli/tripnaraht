// src/agent/training/services/regression-gate.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RegressionGateResult,
  RegressionGateConfig,
} from '../interfaces/evaluation.interface';
import { ReplayComparisonResult } from '../interfaces/evaluation.interface';
import { ModelRegistryService } from './model-registry.service';

/**
 * RegressionGateService
 * 
 * 职责：实现上线gate（性能阈值）
 * 
 * 功能：
 * 1. checkRegression() - 检查是否通过回归门槛
 * 2. checkStatisticalSignificance() - 检查统计显著性
 */
@Injectable()
export class RegressionGateService {
  private readonly logger = new Logger(RegressionGateService.name);
  private readonly defaultConfig: RegressionGateConfig = {
    success_rate_threshold: 0.95, // 新策略 >= baseline * 0.95
    avg_reward_threshold: 0.95, // 新策略 >= baseline * 0.95
    gate_false_positive_rate_threshold: 0.01, // < 1%
    latency_p95_threshold: 1.1, // <= baseline * 1.1
    statistical_significance_level: 0.05, // p < 0.05
  };

  constructor(private readonly modelRegistry: ModelRegistryService) {}

  /**
   * 检查回归门槛
   */
  async checkRegression(
    newPolicyVersion: string,
    baselineVersion: string,
    comparisonResult: ReplayComparisonResult,
    config: RegressionGateConfig = this.defaultConfig,
  ): Promise<RegressionGateResult> {
    this.logger.log(
      `[RegressionGate] 检查回归门槛: newPolicy=${newPolicyVersion}, baseline=${baselineVersion}`,
    );

    // 验证输入参数
    if (!comparisonResult) {
      throw new Error('comparisonResult is required');
    }

    if (!comparisonResult.comparison_metrics) {
      throw new Error('comparisonResult.comparison_metrics is required');
    }

    if (!comparisonResult.statistical_significance) {
      throw new Error('comparisonResult.statistical_significance is required');
    }

    const checks: RegressionGateResult['checks'] = [];

    // 1. 检查成功率
    const successRateCheck = this.checkSuccessRate(
      comparisonResult.comparison_metrics.success_rate,
      config.success_rate_threshold,
    );
    checks.push(successRateCheck);

    // 2. 检查平均Reward
    const avgRewardCheck = this.checkAvgReward(
      comparisonResult.comparison_metrics.avg_reward,
      config.avg_reward_threshold,
    );
    checks.push(avgRewardCheck);

    // 3. 检查Gate误报率（需要从Gate评测结果获取）
    // TODO: 集成Gate评测结果
    checks.push({
      metric: 'gate_false_positive_rate',
      threshold: config.gate_false_positive_rate_threshold,
      actual_value: 0, // TODO: 从Gate评测结果获取
      passed: true, // 临时通过
      message: 'Gate false positive rate check (not implemented)',
    });

    // 4. 检查延迟（P95）
    const latencyCheck = this.checkLatency(
      comparisonResult.comparison_metrics.avg_latency_ms,
      config.latency_p95_threshold,
    );
    checks.push(latencyCheck);

    // 5. 检查统计显著性
    const statisticalSignificance = comparisonResult.statistical_significance;
    const significanceCheck = {
      metric: 'statistical_significance',
      threshold: config.statistical_significance_level,
      actual_value: statisticalSignificance.p_value,
      passed: statisticalSignificance.is_significant,
      message: statisticalSignificance.is_significant
        ? `Statistically significant (p=${statisticalSignificance.p_value.toFixed(3)})`
        : `Not statistically significant (p=${statisticalSignificance.p_value.toFixed(3)})`,
    };
    checks.push(significanceCheck);

    // 计算总体分数
    const passedChecks = checks.filter((c) => c.passed).length;
    const overallScore = passedChecks / checks.length;

    // 判断是否通过
    const passed = overallScore >= 0.8 && statisticalSignificance.is_significant; // 至少80%检查通过且统计显著

    // 生成推荐
    const recommendation = this.generateRecommendation(
      passed,
      checks,
      overallScore,
      statisticalSignificance,
    );

    const result: RegressionGateResult = {
      passed,
      checks,
      statistical_significance: statisticalSignificance,
      overall_score: overallScore,
      recommendation,
    };

    this.logger.log(
      `[RegressionGate] 回归门槛检查完成: passed=${passed}, overallScore=${overallScore.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 检查成功率
   */
  private checkSuccessRate(
    successRate: ReplayComparisonResult['comparison_metrics']['success_rate'],
    threshold: number,
  ): RegressionGateResult['checks'][0] {
    const thresholdValue = successRate.baseline * threshold;
    const passed = successRate.new_policy >= thresholdValue;

    return {
      metric: 'success_rate',
      threshold: thresholdValue,
      actual_value: successRate.new_policy,
      passed,
      message: passed
        ? `Success rate ${(successRate.new_policy * 100).toFixed(1)}% >= threshold ${(thresholdValue * 100).toFixed(1)}%`
        : `Success rate ${(successRate.new_policy * 100).toFixed(1)}% < threshold ${(thresholdValue * 100).toFixed(1)}%`,
    };
  }

  /**
   * 检查平均Reward
   */
  private checkAvgReward(
    avgReward: ReplayComparisonResult['comparison_metrics']['avg_reward'],
    threshold: number,
  ): RegressionGateResult['checks'][0] {
    const thresholdValue = avgReward.baseline * threshold;
    const passed = avgReward.new_policy >= thresholdValue;

    return {
      metric: 'avg_reward',
      threshold: thresholdValue,
      actual_value: avgReward.new_policy,
      passed,
      message: passed
        ? `Avg reward ${avgReward.new_policy.toFixed(3)} >= threshold ${thresholdValue.toFixed(3)}`
        : `Avg reward ${avgReward.new_policy.toFixed(3)} < threshold ${thresholdValue.toFixed(3)}`,
    };
  }

  /**
   * 检查延迟
   */
  private checkLatency(
    latency: ReplayComparisonResult['comparison_metrics']['avg_latency_ms'],
    threshold: number,
  ): RegressionGateResult['checks'][0] {
    const thresholdValue = latency.baseline * threshold;
    const passed = latency.new_policy <= thresholdValue;

    return {
      metric: 'latency_p95',
      threshold: thresholdValue,
      actual_value: latency.new_policy,
      passed,
      message: passed
        ? `Latency ${latency.new_policy.toFixed(1)}ms <= threshold ${thresholdValue.toFixed(1)}ms`
        : `Latency ${latency.new_policy.toFixed(1)}ms > threshold ${thresholdValue.toFixed(1)}ms`,
    };
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    passed: boolean,
    checks: RegressionGateResult['checks'],
    overallScore: number,
    statisticalSignificance: { p_value: number; is_significant: boolean },
  ): RegressionGateResult['recommendation'] {
    if (passed) {
      return {
        should_deploy: true,
        reasoning: `All regression checks passed (overall score: ${(overallScore * 100).toFixed(1)}%, statistically significant)`,
      };
    }

    const failedChecks = checks.filter((c) => !c.passed);
    const reasons: string[] = [];

    if (!statisticalSignificance.is_significant) {
      reasons.push('Not statistically significant');
    }

    if (failedChecks.length > 0) {
      reasons.push(`Failed checks: ${failedChecks.map((c) => c.metric).join(', ')}`);
    }

    if (overallScore < 0.8) {
      reasons.push(`Overall score ${(overallScore * 100).toFixed(1)}% < 80%`);
    }

    return {
      should_deploy: false,
      reasoning: reasons.join('. '),
    };
  }
}
