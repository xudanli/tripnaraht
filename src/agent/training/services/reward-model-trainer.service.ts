// src/agent/training/services/reward-model-trainer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * RewardModelTrainerService
 * 
 * 职责：实现RM训练/蒸馏（偏好对比、评分回归）
 * 
 * 注意：实际训练应该在Python服务中实现，这里提供接口
 */
@Injectable()
export class RewardModelTrainerService {
  private readonly logger = new Logger(RewardModelTrainerService.name);
  private readonly trainingServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.trainingServiceUrl =
      this.configService.get<string>('TRAINING_SERVICE_URL') ||
      'http://localhost:8001';
  }

  /**
   * 训练Reward Model（偏好对比）
   */
  async trainWithPreferenceComparison(
    preferenceData: Array<{
      chosen: any;
      rejected: any;
      context: any;
    }>,
    config: {
      model_type?: string;
      learning_rate?: number;
      batch_size?: number;
      num_epochs?: number;
    } = {},
  ): Promise<{ model_version: string; training_metrics: any }> {
    this.logger.log(
      `[RewardModelTrainer] 开始偏好对比训练: samples=${preferenceData.length}`,
    );

    try {
      // 调用Python训练服务
      const response = await fetch(`${this.trainingServiceUrl}/rm/train/preference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preference_data: preferenceData,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error(`RM training error: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        model_version: string;
        training_metrics: any;
      };

      this.logger.log(
        `[RewardModelTrainer] RM训练完成: modelVersion=${result.model_version}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[RewardModelTrainer] RM训练失败: ${error?.message}`,
      );
      throw error;
    }
  }

  /**
   * 训练Reward Model（评分回归）
   */
  async trainWithScoreRegression(
    scoreData: Array<{
      input: any;
      score: number;
      context: any;
    }>,
    config: {
      model_type?: string;
      learning_rate?: number;
      batch_size?: number;
      num_epochs?: number;
    } = {},
  ): Promise<{ model_version: string; training_metrics: any }> {
    this.logger.log(
      `[RewardModelTrainer] 开始评分回归训练: samples=${scoreData.length}`,
    );

    try {
      const response = await fetch(`${this.trainingServiceUrl}/rm/train/regression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score_data: scoreData,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error(`RM training error: ${response.statusText}`);
      }

      const result = (await response.json()) as {
        model_version: string;
        training_metrics: any;
      };

      this.logger.log(
        `[RewardModelTrainer] RM训练完成: modelVersion=${result.model_version}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[RewardModelTrainer] RM训练失败: ${error?.message}`,
      );
      throw error;
    }
  }
}
