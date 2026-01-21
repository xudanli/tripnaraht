// src/agent/training/services/roll-reward-adapter.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  QualityScoreResult,
} from '../interfaces/enhancement.interface';
import { RollClientService } from './roll-client.service';

/**
 * RollRewardAdapterService
 *
 * 职责：将 QualityScorerService 的调用适配到 ROLL Reward-Worker
 *
 * 这是一个适配器模式，允许现有代码通过 QualityScorerService 接口
 * 调用 ROLL Reward-Worker 计算奖励，实现渐进式迁移。
 */
@Injectable()
export class RollRewardAdapterService {
  private readonly logger = new Logger(RollRewardAdapterService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly rollClient?: RollClientService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_REWARD_ENABLED') !== false &&
      !!this.rollClient;
    
    this.logger.log(
      `[RollRewardAdapter] 初始化: enabled=${this.enabled}`,
    );
  }

  /**
   * 计算奖励（适配 QualityScorerService.score 接口）
   *
   * 注意：这个方法使用 Reward-Worker 计算基础奖励
   * 复杂的 LLM Judge 和 RM 融合仍然由 QualityScorerService 处理
   */
  async computeReward(
    plan: any,
    userRequest: string,
    evidence: any[],
    decisionLog: any[],
  ): Promise<{
    reward: number;
    rawReward: number;
    rewardBreakdown: any[];
    success: boolean;
  }> {
    if (!this.enabled) {
      throw new Error('ROLL Reward-Worker 未启用');
    }

    this.logger.debug(`[RollRewardAdapter] 计算奖励`);

    try {
      // 构建轨迹数据（用于 Reward-Worker）
      const trajectory = {
        trajectory_id: `traj_${Date.now()}`,
        steps: [
          {
            step: 0,
            state: {
              user_request: userRequest,
              plan: plan,
            },
            action: {
              action: 'generate_plan',
              plan: plan,
            },
            reward: 0.0, // 由 Reward-Worker 计算
            next_state: {
              plan_generated: true,
              evidence: evidence,
            },
          },
        ],
        metadata: {
          decision_log: decisionLog,
        },
      };

      // 调用 ROLL Reward-Worker
      const result = await this.rollClient!.callRewardWorker(trajectory);

      if (!result.success) {
        throw new Error(result.error || 'Reward-Worker 调用失败');
      }

      this.logger.debug(
        `[RollRewardAdapter] 奖励计算完成: reward=${result.reward}`,
      );

      return {
        reward: result.reward || 0,
        rawReward: result.rawReward || 0,
        rewardBreakdown: result.rewardBreakdown || [],
        success: true,
      };
    } catch (error: any) {
      this.logger.warn(
        `[RollRewardAdapter] 奖励计算失败: error=${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 转换为 QualityScoreResult 格式
   */
  convertToQualityScoreResult(
    rewardResult: {
      reward: number;
      rawReward: number;
      rewardBreakdown: any[];
    },
    llmJudgeScore?: number,
    rmScore?: number,
  ): QualityScoreResult {
    // 使用 Reward-Worker 的结果作为基础分数
    const baseScore = rewardResult.reward;

    // 如果有 LLM Judge 和 RM 分数，进行融合
    let finalScore = baseScore;
    if (llmJudgeScore !== undefined && rmScore !== undefined) {
      finalScore = llmJudgeScore * 0.6 + rmScore * 0.4;
    } else if (llmJudgeScore !== undefined) {
      finalScore = (baseScore + llmJudgeScore) / 2;
    }

    return {
      score: Math.max(0, Math.min(1, finalScore)),
      llm_judge_score: llmJudgeScore,
      rm_score: rmScore,
      diagnostic_labels: [],
      explanation: `Reward-Worker score: ${baseScore.toFixed(3)}`,
      confidence: 0.8,
    };
  }
}
