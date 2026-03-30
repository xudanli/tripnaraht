/**
 * 用户能力学习服务
 * 
 * 负责从用户反馈中学习用户能力，包括：
 * - 实际最大爬升
 * - 实际风险承受度
 * - 实际节奏
 * - 预测准确度追踪
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserFeedbackService, UserFeedbackData } from './user-feedback.service';
import { LearnedUserCapability } from '../interfaces/unified-world-model.interface';

@Injectable()
export class UserCapabilityLearningService {
  private readonly logger = new Logger(UserCapabilityLearningService.name);

  constructor(
    private prisma: PrismaService,
    private userFeedbackService: UserFeedbackService,
  ) {}

  /**
   * 学习用户能力（基于用户反馈）
   */
  async learnUserCapability(
    userId: string,
    _feedback: {
      type: string;
      data: UserFeedbackData;
    },
  ): Promise<void> {
    this.logger.log(`[UserCapabilityLearning] 学习用户能力: userId=${userId}`);

    try {
      // 1. 获取用户的所有反馈
      const feedbacks = await this.userFeedbackService.getFeedbackByUserId(userId);

      // 2. 计算实际能力
      const learnedCapability = await this.calculateLearnedCapability(userId, feedbacks);

      // 3. 更新或创建用户能力学习记录
      await this.upsertLearnedCapability(userId, learnedCapability);

      this.logger.log(`[UserCapabilityLearning] 用户能力学习完成: userId=${userId}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[UserCapabilityLearning] 学习用户能力失败: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * 计算学习后的用户能力
   */
  private async calculateLearnedCapability(
    userId: string,
    feedbacks: any[],
  ): Promise<Partial<LearnedUserCapability>> {
    // 1. 计算实际最大爬升
    const actualMaxAscent = this.calculateActualMaxAscent(feedbacks);

    // 2. 计算实际风险承受度
    const actualRiskTolerance = this.calculateActualRiskTolerance(feedbacks);

    // 3. 计算实际节奏
    const actualPace = this.calculateActualPace(feedbacks);

    // 4. 计算预测准确度
    const predictionAccuracy = await this.calculatePredictionAccuracy(userId, feedbacks);

    return {
      userId,
      actualMaxAscent,
      actualRiskTolerance,
      actualPace,
      predictionAccuracy,
    };
  }

  /**
   * 计算实际最大爬升
   */
  private calculateActualMaxAscent(feedbacks: any[]): number {
    // 从TRIP_COMPLETED反馈中提取实际爬升数据
    const completedFeedbacks = feedbacks.filter(
      (f) => f.feedback_type === 'TRIP_COMPLETED',
    );

    if (completedFeedbacks.length === 0) {
      return 0; // 默认值
    }

    // 计算平均每日爬升
    const dailyAscents = completedFeedbacks
      .map((f) => {
        const data = f.feedback_data as UserFeedbackData;
        if (data.actualAscent && data.actualDays) {
          return data.actualAscent / data.actualDays;
        }
        return null;
      })
      .filter((v): v is number => v !== null);

    if (dailyAscents.length === 0) {
      return 0; // 默认值
    }

    // 返回最大每日爬升（取95%分位数，避免异常值）
    dailyAscents.sort((a, b) => b - a);
    const p95Index = Math.floor(dailyAscents.length * 0.05);
    return dailyAscents[p95Index] || dailyAscents[0];
  }

  /**
   * 计算实际风险承受度
   */
  private calculateActualRiskTolerance(feedbacks: any[]): 'LOW' | 'MEDIUM' | 'HIGH' {
    // 从DAY_FAILED反馈中推断风险承受度
    const failedFeedbacks = feedbacks.filter(
      (f) => f.feedback_type === 'DAY_FAILED',
    );

    // 如果失败率低，说明风险承受度高
    const totalTrips = feedbacks.filter(
      (f) => f.feedback_type === 'TRIP_COMPLETED',
    ).length;

    if (totalTrips === 0) {
      return 'MEDIUM'; // 默认值
    }

    const failureRate = failedFeedbacks.length / totalTrips;

    if (failureRate < 0.1) {
      return 'HIGH';
    } else if (failureRate < 0.3) {
      return 'MEDIUM';
    } else {
      return 'LOW';
    }
  }

  /**
   * 计算实际节奏
   */
  private calculateActualPace(feedbacks: any[]): 'slow' | 'moderate' | 'fast' {
    // 从TRIP_COMPLETED反馈中提取实际天数
    const completedFeedbacks = feedbacks.filter(
      (f) => f.feedback_type === 'TRIP_COMPLETED',
    );

    if (completedFeedbacks.length === 0) {
      return 'moderate'; // 默认值
    }

    // TODO: 需要与计划天数对比，计算节奏
    // 这里简化处理，返回默认值
    return 'moderate';
  }

  /**
   * 计算预测准确度
   */
  private async calculatePredictionAccuracy(
    _userId: string,
    _feedbacks: any[],
  ): Promise<LearnedUserCapability['predictionAccuracy']> {
    // TODO: 实现预测准确度计算
    // 需要对比预测值和实际值
    return {
      ascentPrediction: 0.8, // 默认值
      timePrediction: 0.8,
      difficultyPrediction: 0.8,
    };
  }

  /**
   * 更新或创建用户能力学习记录
   */
  private async upsertLearnedCapability(
    userId: string,
    learnedCapability: Partial<LearnedUserCapability>,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO user_capability_learning (
        user_id,
        learned_capability,
        prediction_accuracy,
        last_updated,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,
        $2::jsonb,
        $3::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        learned_capability = $2::jsonb,
        prediction_accuracy = $3::jsonb,
        last_updated = NOW(),
        updated_at = NOW()
    `,
      userId,
      JSON.stringify({
        actualMaxAscent: learnedCapability.actualMaxAscent,
        actualRiskTolerance: learnedCapability.actualRiskTolerance,
        actualPace: learnedCapability.actualPace,
      }),
      JSON.stringify(learnedCapability.predictionAccuracy),
    );
  }

  /**
   * 获取学习后的用户能力
   */
  async getLearnedCapability(
    userId: string,
  ): Promise<LearnedUserCapability | null> {
    const result = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM user_capability_learning
      WHERE user_id = $1::uuid
    `, userId);

    const records = result as any[];
    if (records.length === 0) {
      return null;
    }

    const record = records[0];
    return {
      userId,
      actualMaxAscent: record.learned_capability?.actualMaxAscent || 0,
      actualRiskTolerance: record.learned_capability?.actualRiskTolerance || 'MEDIUM',
      actualPace: record.learned_capability?.actualPace || 'moderate',
      preferredPOITypes: record.learned_capability?.preferredPOITypes || [],
      predictionAccuracy: record.prediction_accuracy || {
        ascentPrediction: 0.8,
        timePrediction: 0.8,
        difficultyPrediction: 0.8,
      },
    };
  }
}
