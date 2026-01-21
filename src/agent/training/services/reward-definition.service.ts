// src/agent/training/services/reward-definition.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RewardFunctionConfig,
  RewardCalculationResult,
  RewardWeights,
} from '../interfaces/product.interface';

/**
 * RewardDefinitionService
 * 
 * 职责：定义reward的业务含义、成功指标、目标函数权重
 * 
 * 功能：
 * 1. 定义Reward函数
 * 2. 计算Reward
 * 3. 验证Reward效果
 */
@Injectable()
export class RewardDefinitionService {
  private readonly logger = new Logger(RewardDefinitionService.name);
  private readonly defaultConfig: RewardFunctionConfig = {
    weights: {
      success_rate: 0.4, // 40%权重
      satisfaction: 0.3, // 30%权重
      cost: -0.2, // -20%权重（成本越低越好）
      compliance_rate: 0.1, // 10%权重
    },
    normalization: {
      success_rate_range: [0, 1],
      satisfaction_range: [0, 1],
      cost_range: [0, 1], // 归一化的成本（0=最低成本，1=最高成本）
      compliance_rate_range: [0, 1],
    },
  };

  /**
   * 计算Reward
   */
  calculateReward(
    metrics: {
      success_rate: number; // 0-1
      satisfaction: number; // 0-1
      cost: number; // 归一化成本 0-1
      compliance_rate: number; // 0-1
    },
    config: RewardFunctionConfig = this.defaultConfig,
  ): RewardCalculationResult {
    this.logger.debug(
      `[RewardDefinition] 计算Reward: successRate=${metrics.success_rate}, satisfaction=${metrics.satisfaction}`,
    );

    // 归一化指标
    const normalizedSuccessRate = this.normalize(
      metrics.success_rate,
      config.normalization.success_rate_range,
    );
    const normalizedSatisfaction = this.normalize(
      metrics.satisfaction,
      config.normalization.satisfaction_range,
    );
    const normalizedCost = this.normalize(
      metrics.cost,
      config.normalization.cost_range,
    );
    const normalizedComplianceRate = this.normalize(
      metrics.compliance_rate,
      config.normalization.compliance_rate_range,
    );

    // 计算各组件Reward
    const successRateReward = normalizedSuccessRate * config.weights.success_rate;
    const satisfactionReward = normalizedSatisfaction * config.weights.satisfaction;
    const costReward = normalizedCost * config.weights.cost; // 负权重，成本越低reward越高
    const complianceRateReward =
      normalizedComplianceRate * config.weights.compliance_rate;

    // 计算总Reward
    const totalReward =
      successRateReward +
      satisfactionReward +
      costReward +
      complianceRateReward;

    const result: RewardCalculationResult = {
      total_reward: totalReward,
      component_rewards: {
        success_rate_reward: successRateReward,
        satisfaction_reward: satisfactionReward,
        cost_reward: costReward,
        compliance_rate_reward: complianceRateReward,
      },
      metadata: {
        calculation_time: new Date().toISOString(),
        config_version: '1.0.0',
      },
    };

    this.logger.debug(
      `[RewardDefinition] Reward计算完成: totalReward=${totalReward.toFixed(3)}`,
    );

    return result;
  }

  /**
   * 归一化值
   */
  private normalize(value: number, range: [number, number]): number {
    const [min, max] = range;
    if (max === min) return 0;
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }

  /**
   * 更新权重配置
   */
  updateWeights(weights: Partial<RewardWeights>): RewardFunctionConfig {
    const newWeights = { ...this.defaultConfig.weights, ...weights };
    
    // 归一化权重（确保总和为1）
    const totalWeight = Math.abs(newWeights.success_rate) +
      Math.abs(newWeights.satisfaction) +
      Math.abs(newWeights.cost) +
      Math.abs(newWeights.compliance_rate);
    
    if (totalWeight > 0) {
      newWeights.success_rate = newWeights.success_rate / totalWeight;
      newWeights.satisfaction = newWeights.satisfaction / totalWeight;
      newWeights.cost = newWeights.cost / totalWeight;
      newWeights.compliance_rate = newWeights.compliance_rate / totalWeight;
    }

    const newConfig: RewardFunctionConfig = {
      ...this.defaultConfig,
      weights: newWeights,
    };

    this.logger.log(
      `[RewardDefinition] 权重已更新: ${JSON.stringify(newWeights)}`,
    );

    return newConfig;
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): RewardFunctionConfig {
    return { ...this.defaultConfig };
  }
}
