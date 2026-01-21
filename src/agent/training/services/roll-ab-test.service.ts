// src/agent/training/services/roll-ab-test.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ABTestManagerService } from './ab-test-manager.service';
import { RollClientService } from './roll-client.service';
import { RollPolicyAdapterService } from './roll-policy-adapter.service';
import { RollRewardAdapterService } from './roll-reward-adapter.service';
import { RollTrajectoryAdapterService } from './roll-trajectory-adapter.service';

/**
 * ROLL A/B 测试变体
 */
export interface RollABTestVariant {
  variant_id: string;
  name: string;
  roll_enabled: boolean;
  roll_config?: {
    use_policy_worker?: boolean;
    use_reward_worker?: boolean;
    use_trajectory_worker?: boolean;
    worker_config?: Record<string, any>;
  };
  traffic_percentage: number;
}

/**
 * RollABTestService
 *
 * 职责：将 ROLL Workers 集成到 A/B 测试框架
 */
@Injectable()
export class RollABTestService {
  private readonly logger = new Logger(RollABTestService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly abTestManager: ABTestManagerService,
    @Optional() private readonly rollClient?: RollClientService,
    @Optional() private readonly rollPolicyAdapter?: RollPolicyAdapterService,
    @Optional() private readonly rollRewardAdapter?: RollRewardAdapterService,
    @Optional() private readonly rollTrajectoryAdapter?: RollTrajectoryAdapterService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_AB_TEST_ENABLED') !== false &&
      !!this.rollClient;
    
    this.logger.log(
      `[RollABTest] 初始化: enabled=${this.enabled}`,
    );
  }

  /**
   * 创建 ROLL A/B 测试实验
   */
  async createRollExperiment(
    name: string,
    description: string,
    variants: RollABTestVariant[],
    successMetrics: string[],
  ): Promise<{ experimentId: string; success: boolean }> {
    if (!this.enabled) {
      throw new Error('ROLL A/B 测试未启用');
    }

    this.logger.log(`[RollABTest] 创建 ROLL A/B 测试实验: ${name}`);

    // 转换变体格式
    const abTestVariants = variants.map((v) => ({
      name: v.name,
      model_version: v.roll_enabled ? 'roll-enabled' : 'roll-disabled',
      traffic_percentage: v.traffic_percentage,
      metadata: {
        roll_enabled: v.roll_enabled,
        roll_config: v.roll_config,
      },
    }));

    // 创建 A/B 测试实验
    const experiment = await this.abTestManager.createExperiment(
      name,
      description,
      abTestVariants,
      successMetrics,
    );

    this.logger.log(
      `[RollABTest] ROLL A/B 测试实验已创建: experimentId=${experiment.experiment_id}`,
    );

    return {
      experimentId: experiment.experiment_id,
      success: true,
    };
  }

  /**
   * 根据实验分配决定是否使用 ROLL Workers
   */
  async shouldUseRoll(
    experimentId: string,
    requestId: string,
    userId?: string,
  ): Promise<{
    useRoll: boolean;
    variantId?: string;
    rollConfig?: Record<string, any>;
  }> {
    if (!this.enabled) {
      return { useRoll: false };
    }

    try {
      // 获取实验分配
      const assignment = await this.abTestManager.assignToGroup(
        experimentId,
        requestId,
        userId,
      );

      // 获取实验信息
      const experiment = this.abTestManager.getExperiment(experimentId);
      if (!experiment) {
        return { useRoll: false };
      }

      // 查找变体
      const variant = experiment.variants.find(
        (v) => v.variant_id === assignment.variant_id,
      );

      if (!variant) {
        return { useRoll: false };
      }

      // 检查变体元数据（从 model_version 或 metadata 中获取）
      const metadata = (variant as any).metadata;
      const useRoll =
        metadata?.roll_enabled === true ||
        variant.model_version === 'roll-enabled';

      this.logger.debug(
        `[RollABTest] 实验分配: experimentId=${experimentId}, variantId=${assignment.variant_id}, useRoll=${useRoll}`,
      );

      return {
        useRoll,
        variantId: assignment.variant_id,
        rollConfig: metadata?.roll_config,
      };
    } catch (error: any) {
      this.logger.warn(
        `[RollABTest] 获取实验分配失败: ${error?.message}`,
      );
      return { useRoll: false };
    }
  }

  /**
   * 使用 ROLL Workers 进行策略推理（A/B 测试）
   */
  async predictWithRollABTest(
    experimentId: string,
    request: any,
    requestId: string,
    userId?: string,
  ): Promise<{
    action: string;
    confidence: number;
    variantId?: string;
    useRoll: boolean;
  }> {
    const { useRoll, variantId, rollConfig } = await this.shouldUseRoll(
      experimentId,
      requestId,
      userId,
    );

    if (useRoll && this.rollPolicyAdapter) {
      // 使用 ROLL Policy-Worker
      const result = await this.rollPolicyAdapter.predict(request);
      
      this.logger.debug(
        `[RollABTest] 使用 ROLL Policy-Worker: experimentId=${experimentId}, variantId=${variantId}`,
      );

      return {
        action: result.action || 'ALLOW',
        confidence: result.confidence || 0.8,
        variantId,
        useRoll: true,
      };
    }

    // 回退到默认策略（不使用 ROLL）
    return {
      action: 'ALLOW',
      confidence: 0.8,
      variantId,
      useRoll: false,
    };
  }

  /**
   * 使用 ROLL Workers 进行奖励计算（A/B 测试）
   */
  async computeRewardWithRollABTest(
    experimentId: string,
    trajectory: any,
    requestId: string,
    userId?: string,
    rewardConfig?: any,
  ): Promise<{
    reward: number;
    variantId?: string;
    useRoll: boolean;
  }> {
    const { useRoll, variantId } = await this.shouldUseRoll(
      experimentId,
      requestId,
      userId,
    );

    if (useRoll && this.rollRewardAdapter) {
      // 使用 ROLL Reward-Worker
      // 构建轨迹数据用于奖励计算
      const trajectoryData = Array.isArray(trajectory) ? trajectory[0] : trajectory;
      
      // 提取用户请求（如果可能）
      const userRequest = trajectoryData?.userRequest || trajectoryData?.user_request || 'A/B Test Request';
      const evidence = trajectoryData?.evidence || [];
      const decisionLog = trajectoryData?.decisionLog || trajectoryData?.decision_log || [];
      
      const result = await this.rollRewardAdapter.computeReward(
        trajectoryData,
        userRequest,
        evidence,
        decisionLog,
      );

      this.logger.debug(
        `[RollABTest] 使用 ROLL Reward-Worker: experimentId=${experimentId}, variantId=${variantId}`,
      );

      return {
        reward: result.reward || 0,
        variantId,
        useRoll: true,
      };
    }

    // 回退到默认奖励计算（不使用 ROLL）
    return {
      reward: 0.5,
      variantId,
      useRoll: false,
    };
  }

  /**
   * 使用 ROLL Workers 生成轨迹（A/B 测试）
   */
  async generateTrajectoryWithRollABTest(
    experimentId: string,
    data: any,
    requestId: string,
    userId?: string,
  ): Promise<{
    trajectoryId?: string;
    trajectory?: any;
    variantId?: string;
    useRoll: boolean;
  }> {
    const { useRoll, variantId } = await this.shouldUseRoll(
      experimentId,
      requestId,
      userId,
    );

    if (useRoll && this.rollTrajectoryAdapter) {
      // 使用 ROLL Actor-Worker
      const result = await this.rollTrajectoryAdapter.generateTrajectory(data);

      this.logger.debug(
        `[RollABTest] 使用 ROLL Actor-Worker: experimentId=${experimentId}, variantId=${variantId}`,
      );

      return {
        trajectoryId: result.trajectoryId,
        trajectory: result.trajectory,
        variantId,
        useRoll: true,
      };
    }

    // 回退到默认轨迹生成（不使用 ROLL）
    return {
      variantId,
      useRoll: false,
    };
  }

  /**
   * 分析 ROLL A/B 测试结果
   */
  async analyzeRollResults(
    experimentId: string,
    variantMetrics: Array<{
      variant_id: string;
      sample_size: number;
      success_count: number;
      total_reward: number;
      total_latency_ms: number;
      error_count: number;
      roll_enabled?: boolean;
    }>,
  ): Promise<{
    experimentId: string;
    rollVsBaseline: {
      roll_variant: any;
      baseline_variant: any;
      improvement: {
        success_rate: number;
        avg_reward: number;
        avg_latency: number;
      };
    };
    recommendation: string;
  }> {
    // 分析 A/B 测试结果
    const abTestResult = await this.abTestManager.analyzeResults(
      experimentId,
      variantMetrics,
    );

    // 分离 ROLL 和基线变体
    const rollVariant = variantMetrics.find((v) => v.roll_enabled === true);
    const baselineVariant = variantMetrics.find(
      (v) => v.roll_enabled === false,
    );

    if (!rollVariant || !baselineVariant) {
      return {
        experimentId,
        rollVsBaseline: {
          roll_variant: rollVariant,
          baseline_variant: baselineVariant,
          improvement: {
            success_rate: 0,
            avg_reward: 0,
            avg_latency: 0,
          },
        },
        recommendation: '需要 ROLL 和基线变体的数据',
      };
    }

    // 计算改进
    const rollSuccessRate = rollVariant.success_count / rollVariant.sample_size;
    const baselineSuccessRate =
      baselineVariant.success_count / baselineVariant.sample_size;
    const successRateImprovement = rollSuccessRate - baselineSuccessRate;

    const rollAvgReward = rollVariant.total_reward / rollVariant.sample_size;
    const baselineAvgReward =
      baselineVariant.total_reward / baselineVariant.sample_size;
    const rewardImprovement = rollAvgReward - baselineAvgReward;

    const rollAvgLatency =
      rollVariant.total_latency_ms / rollVariant.sample_size;
    const baselineAvgLatency =
      baselineVariant.total_latency_ms / baselineVariant.sample_size;
    const latencyImprovement = baselineAvgLatency - rollAvgLatency; // 负值表示改进

    // 生成建议
    let recommendation = '继续观察';
    if (
      successRateImprovement > 0.05 &&
      rewardImprovement > 0.1 &&
      latencyImprovement > 0
    ) {
      recommendation = 'ROLL 变体表现更好，建议逐步扩大流量';
    } else if (
      successRateImprovement < -0.05 ||
      rewardImprovement < -0.1 ||
      latencyImprovement < -100
    ) {
      recommendation = '基线变体表现更好，建议回退 ROLL';
    }

    return {
      experimentId,
      rollVsBaseline: {
        roll_variant: rollVariant,
        baseline_variant: baselineVariant,
        improvement: {
          success_rate: successRateImprovement,
          avg_reward: rewardImprovement,
          avg_latency: latencyImprovement,
        },
      },
      recommendation,
    };
  }
}
