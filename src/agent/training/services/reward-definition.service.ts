// src/agent/training/services/reward-definition.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  RewardFunctionConfig,
  RewardCalculationResult,
  RewardWeights,
  GatedRewardConfig,
  GatedRewardMetrics,
  GatedRewardResult,
  GateFailureType,
  TripNARAApprovalSignals,
} from '../interfaces/product.interface';

/**
 * RewardDefinitionService
 * 
 * TripNARA RL 框架 v2.0 - 门控型奖励系统
 * 
 * 核心原则：
 * 1. 安全 > 合规 > 可执行（门控层）
 * 2. 门控失败 → 直接负分 + 不可训练
 * 3. 门控通过后才计算体验分
 * 4. 用户审批 ≠ 安全真值（拆分信号）
 * 
 * 功能：
 * 1. calculateGatedReward() - 门控型奖励计算（推荐）
 * 2. calculateTripNARAReward() - 基于拆分审批信号计算
 * 3. calculateReward() - [Legacy] 线性加权奖励（兼容）
 */
@Injectable()
export class RewardDefinitionService {
  private readonly logger = new Logger(RewardDefinitionService.name);
  
  // ============================================================================
  // TripNARA Gated Reward 配置
  // ============================================================================
  
  private readonly gatedConfig: GatedRewardConfig = {
    gates: {
      safety_gate: {
        threshold: 0.9,
        penalty: -2.0,
        description: '安全门控：天气/地形/道路风险',
      },
      compliance_gate: {
        threshold: 0.95,
        penalty: -1.5,
        description: '合规门控：法律/签证/许可',
      },
      feasibility_gate: {
        threshold: 0.8,
        penalty: -1.0,
        description: '可执行门控：交通/时间/物理可达',
      },
    },
    experience: {
      satisfaction: 0.4,
      diversity: 0.25,
      cost_efficiency: 0.2,
      novelty: 0.15,
    },
    version: '2.0.0',
  };

  // [Legacy] 保持向后兼容
  private readonly defaultConfig: RewardFunctionConfig = {
    weights: {
      success_rate: 0.4,
      satisfaction: 0.3,
      cost: -0.2,
      compliance_rate: 0.1,
    },
    normalization: {
      success_rate_range: [0, 1],
      satisfaction_range: [0, 1],
      cost_range: [0, 1],
      compliance_rate_range: [0, 1],
    },
  };

  // ============================================================================
  // TripNARA Gated Reward（推荐使用）
  // ============================================================================

  /**
   * 门控型奖励计算
   * 
   * TripNARA 核心原则：安全 > 合规 > 可执行
   * 任一门控失败直接返回负分，轨迹标记为不可训练
   */
  calculateGatedReward(
    metrics: GatedRewardMetrics,
    config: GatedRewardConfig = this.gatedConfig,
  ): GatedRewardResult {
    this.logger.debug(
      `[GatedReward] 计算开始: safety=${metrics.safety_score}, compliance=${metrics.compliance_score}, feasibility=${metrics.feasibility_score}`,
    );

    const gateScores = {
      safety: metrics.safety_score,
      compliance: metrics.compliance_score,
      feasibility: metrics.feasibility_score,
    };

    // ========== 门控层检查 ==========
    
    // 1. 安全门控（最高优先级）
    if (metrics.safety_score < config.gates.safety_gate.threshold) {
      this.logger.warn(
        `[GatedReward] 安全门控失败: ${metrics.safety_score} < ${config.gates.safety_gate.threshold}`,
      );
      return this.createGateFailureResult(
        'SAFETY_GATE',
        config.gates.safety_gate.penalty,
        `安全门控未通过: ${metrics.safety_score.toFixed(2)} < ${config.gates.safety_gate.threshold}`,
        gateScores,
        config.version,
      );
    }

    // 2. 合规门控
    if (metrics.compliance_score < config.gates.compliance_gate.threshold) {
      this.logger.warn(
        `[GatedReward] 合规门控失败: ${metrics.compliance_score} < ${config.gates.compliance_gate.threshold}`,
      );
      return this.createGateFailureResult(
        'COMPLIANCE_GATE',
        config.gates.compliance_gate.penalty,
        `合规门控未通过: ${metrics.compliance_score.toFixed(2)} < ${config.gates.compliance_gate.threshold}`,
        gateScores,
        config.version,
      );
    }

    // 3. 可执行门控
    if (metrics.feasibility_score < config.gates.feasibility_gate.threshold) {
      this.logger.warn(
        `[GatedReward] 可执行门控失败: ${metrics.feasibility_score} < ${config.gates.feasibility_gate.threshold}`,
      );
      return this.createGateFailureResult(
        'FEASIBILITY_GATE',
        config.gates.feasibility_gate.penalty,
        `可执行门控未通过: ${metrics.feasibility_score.toFixed(2)} < ${config.gates.feasibility_gate.threshold}`,
        gateScores,
        config.version,
      );
    }

    // ========== 体验层计算（门控通过后） ==========
    
    const satisfactionScore = metrics.satisfaction * config.experience.satisfaction;
    const diversityScore = metrics.diversity * config.experience.diversity;
    const costEfficiencyScore = metrics.cost_efficiency * config.experience.cost_efficiency;
    const noveltyScore = metrics.novelty * config.experience.novelty;

    const baseScore = satisfactionScore + diversityScore + costEfficiencyScore + noveltyScore;

    // 证据覆盖奖励（可选）
    let evidenceBonus = 0;
    if (metrics.evidence_coverage && metrics.evidence_coverage > 0.8) {
      evidenceBonus = (metrics.evidence_coverage - 0.8) * 0.1;
    }

    // 风险披露奖励
    let riskDisclosureBonus = 0;
    if (metrics.risk_disclosure === true) {
      riskDisclosureBonus = 0.05;
    }

    const totalReward = Math.min(1.0, baseScore + evidenceBonus + riskDisclosureBonus);

    const result: GatedRewardResult = {
      total_reward: totalReward,
      gate_passed: true,
      trainable_for_dpo: true,
      trainable_for_ppo: true,
      reward_type: 'FULL_SUCCESS',
      preference_label: 'POSITIVE',
      reason: '所有门控通过，体验分计算完成',
      experience_breakdown: {
        satisfaction: satisfactionScore,
        diversity: diversityScore,
        cost_efficiency: costEfficiencyScore,
        novelty: noveltyScore,
        base_score: baseScore,
        preference_bonus: evidenceBonus + riskDisclosureBonus,
      },
      gate_scores: gateScores,
      metadata: {
        calculation_time: new Date().toISOString(),
        config_version: config.version,
      },
    };

    this.logger.debug(
      `[GatedReward] 计算完成: totalReward=${totalReward.toFixed(3)}, gate_passed=true`,
    );

    return result;
  }

  /**
   * 创建门控失败结果
   */
  private createGateFailureResult(
    gateFailure: GateFailureType,
    penalty: number,
    reason: string,
    gateScores: { safety: number; compliance: number; feasibility: number },
    configVersion: string,
  ): GatedRewardResult {
    return {
      total_reward: penalty,
      gate_passed: false,
      gate_failure: gateFailure,
      trainable_for_dpo: false,
      trainable_for_ppo: false,
      reward_type: 'GATE_FAILURE',
      preference_label: null,
      reason,
      gate_scores: gateScores,
      metadata: {
        calculation_time: new Date().toISOString(),
        config_version: configVersion,
      },
    };
  }

  // ============================================================================
  // TripNARA 拆分审批信号计算
  // ============================================================================

  /**
   * 基于拆分审批信号计算奖励
   * 
   * 核心原则：
   * - 系统门控失败 → 负分 + 不可训练
   * - 系统通过 + 用户拒绝 → 低分 + DPO 负样本
   * - 系统通过 + 用户采纳 → 高分 + DPO/PPO 正样本
   */
  calculateTripNARAReward(
    signals: TripNARAApprovalSignals,
    metrics: GatedRewardMetrics,
  ): GatedRewardResult {
    const config = this.gatedConfig;
    
    // 1. 系统门控失败 → 直接负分，不可训练
    if (!signals.system_approval.system_approved) {
      const rejectionReason = signals.system_approval.rejection_reasons?.join(', ') || '系统门控失败';
      
      this.logger.warn(
        `[TripNARAReward] 系统门控失败: ${rejectionReason}`,
      );

      return {
        total_reward: -2.0,
        gate_passed: false,
        trainable_for_dpo: false,
        trainable_for_ppo: false,
        reward_type: 'GATE_FAILURE',
        preference_label: null,
        reason: `系统门控失败: ${rejectionReason}`,
        gate_scores: {
          safety: signals.system_approval.safety_pass ? 1.0 : 0.0,
          compliance: signals.system_approval.compliance_pass ? 1.0 : 0.0,
          feasibility: signals.system_approval.feasibility_pass ? 1.0 : 0.0,
        },
        metadata: {
          calculation_time: new Date().toISOString(),
          config_version: config.version,
        },
      };
    }

    // 2. 系统通过 + 用户拒绝 → 用于 DPO 负样本对比学习
    if (!signals.user_preference.user_approved) {
      this.logger.debug(
        `[TripNARAReward] 系统通过但用户未采纳 → DPO 负样本`,
      );

      return {
        total_reward: 0.3, // 低分但非负（系统认为可以，用户不喜欢）
        gate_passed: true,
        trainable_for_dpo: true,   // 可用于 DPO（作为负样本）
        trainable_for_ppo: false,  // 不用于 PPO
        reward_type: 'USER_REJECTED',
        preference_label: 'NEGATIVE', // DPO 负样本
        reason: '系统通过但用户未采纳',
        gate_scores: {
          safety: 1.0,
          compliance: 1.0,
          feasibility: 1.0,
        },
        metadata: {
          calculation_time: new Date().toISOString(),
          config_version: config.version,
        },
      };
    }

    // 3. 系统通过 + 用户采纳 → 高质量正样本
    const experienceScore = this.calculateExperienceScore(metrics);
    const preferenceBonus = this.calculatePreferenceBonus(signals.user_preference);

    const totalReward = Math.min(1.0, experienceScore + preferenceBonus);

    this.logger.debug(
      `[TripNARAReward] 完全成功: experienceScore=${experienceScore.toFixed(3)}, preferenceBonus=${preferenceBonus.toFixed(3)}, total=${totalReward.toFixed(3)}`,
    );

    return {
      total_reward: totalReward,
      gate_passed: true,
      trainable_for_dpo: true,   // 可用于 DPO（作为正样本）
      trainable_for_ppo: true,   // 可用于 PPO
      reward_type: 'FULL_SUCCESS',
      preference_label: 'POSITIVE', // DPO 正样本
      reason: '系统通过且用户采纳',
      experience_breakdown: {
        satisfaction: metrics.satisfaction * this.gatedConfig.experience.satisfaction,
        diversity: metrics.diversity * this.gatedConfig.experience.diversity,
        cost_efficiency: metrics.cost_efficiency * this.gatedConfig.experience.cost_efficiency,
        novelty: metrics.novelty * this.gatedConfig.experience.novelty,
        base_score: experienceScore,
        preference_bonus: preferenceBonus,
      },
      gate_scores: {
        safety: 1.0,
        compliance: 1.0,
        feasibility: 1.0,
      },
      metadata: {
        calculation_time: new Date().toISOString(),
        config_version: this.gatedConfig.version,
      },
    };
  }

  /**
   * 计算体验分数
   */
  private calculateExperienceScore(metrics: GatedRewardMetrics): number {
    const config = this.gatedConfig.experience;
    return (
      metrics.satisfaction * config.satisfaction +
      metrics.diversity * config.diversity +
      metrics.cost_efficiency * config.cost_efficiency +
      metrics.novelty * config.novelty
    );
  }

  /**
   * 计算偏好加分
   */
  private calculatePreferenceBonus(
    preference: TripNARAApprovalSignals['user_preference'],
  ): number {
    let bonus = 0;

    // 满意度评分加分
    if (preference.satisfaction_rating) {
      // 5分制转换为 0-0.1 的加分
      bonus += ((preference.satisfaction_rating - 3) / 2) * 0.1;
    }

    // 偏好因素加分
    if (preference.preference_factors) {
      const factors = preference.preference_factors;
      const avgFactor = (
        factors.route_appeal +
        factors.pacing_comfort +
        factors.poi_interest +
        factors.cost_acceptability
      ) / 4;
      // 平均偏好因素 > 0.7 给予加分
      if (avgFactor > 0.7) {
        bonus += (avgFactor - 0.7) * 0.1;
      }
    }

    return Math.max(0, Math.min(0.2, bonus)); // 最大加分 0.2
  }

  // ============================================================================
  // 配置管理
  // ============================================================================

  /**
   * 获取门控型奖励配置
   */
  getGatedConfig(): GatedRewardConfig {
    return { ...this.gatedConfig };
  }

  /**
   * 更新门控阈值
   */
  updateGateThresholds(
    gates: Partial<{
      safety: number;
      compliance: number;
      feasibility: number;
    }>,
  ): GatedRewardConfig {
    if (gates.safety !== undefined) {
      this.gatedConfig.gates.safety_gate.threshold = gates.safety;
    }
    if (gates.compliance !== undefined) {
      this.gatedConfig.gates.compliance_gate.threshold = gates.compliance;
    }
    if (gates.feasibility !== undefined) {
      this.gatedConfig.gates.feasibility_gate.threshold = gates.feasibility;
    }

    this.logger.log(
      `[GatedReward] 门控阈值已更新: safety=${this.gatedConfig.gates.safety_gate.threshold}, compliance=${this.gatedConfig.gates.compliance_gate.threshold}, feasibility=${this.gatedConfig.gates.feasibility_gate.threshold}`,
    );

    return { ...this.gatedConfig };
  }

  /**
   * 更新体验层权重
   */
  updateExperienceWeights(
    weights: Partial<{
      satisfaction: number;
      diversity: number;
      cost_efficiency: number;
      novelty: number;
    }>,
  ): GatedRewardConfig {
    // 更新权重
    if (weights.satisfaction !== undefined) {
      this.gatedConfig.experience.satisfaction = weights.satisfaction;
    }
    if (weights.diversity !== undefined) {
      this.gatedConfig.experience.diversity = weights.diversity;
    }
    if (weights.cost_efficiency !== undefined) {
      this.gatedConfig.experience.cost_efficiency = weights.cost_efficiency;
    }
    if (weights.novelty !== undefined) {
      this.gatedConfig.experience.novelty = weights.novelty;
    }

    // 归一化（确保总和为 1）
    const total =
      this.gatedConfig.experience.satisfaction +
      this.gatedConfig.experience.diversity +
      this.gatedConfig.experience.cost_efficiency +
      this.gatedConfig.experience.novelty;

    if (total > 0 && total !== 1) {
      this.gatedConfig.experience.satisfaction /= total;
      this.gatedConfig.experience.diversity /= total;
      this.gatedConfig.experience.cost_efficiency /= total;
      this.gatedConfig.experience.novelty /= total;
    }

    this.logger.log(
      `[GatedReward] 体验权重已更新: ${JSON.stringify(this.gatedConfig.experience)}`,
    );

    return { ...this.gatedConfig };
  }

  // ============================================================================
  // [Legacy] 线性加权奖励（保持兼容性）
  // ============================================================================

  /**
   * [Legacy] 计算Reward - 保持向后兼容
   * 
   * @deprecated 建议使用 calculateGatedReward()
   */
  calculateReward(
    metrics: {
      success_rate: number;
      satisfaction: number;
      cost: number;
      compliance_rate: number;
    },
    config: RewardFunctionConfig = this.defaultConfig,
  ): RewardCalculationResult {
    this.logger.debug(
      `[RewardDefinition] [Legacy] 计算Reward: successRate=${metrics.success_rate}, satisfaction=${metrics.satisfaction}`,
    );

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

    const successRateReward = normalizedSuccessRate * config.weights.success_rate;
    const satisfactionReward = normalizedSatisfaction * config.weights.satisfaction;
    const costReward = normalizedCost * config.weights.cost;
    const complianceRateReward = normalizedComplianceRate * config.weights.compliance_rate;

    const totalReward =
      successRateReward + satisfactionReward + costReward + complianceRateReward;

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
      `[RewardDefinition] [Legacy] Reward计算完成: totalReward=${totalReward.toFixed(3)}`,
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
   * [Legacy] 更新权重配置
   */
  updateWeights(weights: Partial<RewardWeights>): RewardFunctionConfig {
    const newWeights = { ...this.defaultConfig.weights, ...weights };
    
    const totalWeight =
      Math.abs(newWeights.success_rate) +
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
      `[RewardDefinition] [Legacy] 权重已更新: ${JSON.stringify(newWeights)}`,
    );

    return newConfig;
  }

  /**
   * [Legacy] 获取默认配置
   */
  getDefaultConfig(): RewardFunctionConfig {
    return { ...this.defaultConfig };
  }
}
