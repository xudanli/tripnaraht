/**
 * 用户反馈服务
 * 
 * 负责收集和管理用户反馈数据，包括：
 * - 执行后问卷
 * - 行为追踪数据
 * - 数据质量评估
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 用户反馈类型
 */
export type UserFeedbackType = 
  | 'TRIP_COMPLETED' 
  | 'POI_SKIPPED' 
  | 'DAY_FAILED' 
  | 'POI_ADDED';

/**
 * 用户反馈数据
 */
export interface UserFeedbackData {
  // TRIP_COMPLETED
  actualDays?: number;
  actualAscent?: number;
  actualDifficulty?: number;
  overallSatisfaction?: number; // 1-5
  
  // POI_SKIPPED
  skippedPoiIds?: string[];
  skipReason?: string;
  
  // DAY_FAILED
  failedDayNumbers?: number[];
  failureReason?: string;
  
  // POI_ADDED
  addedPoiIds?: string[];
}

/**
 * 用户反馈质量评分
 */
export interface UserFeedbackQuality {
  completeness: number;      // 完整性（0-1）
  consistency: number;       // 一致性（0-1）
  credibility: number;       // 可信度（0-1）
  overallScore: number;      // 综合评分（0-1）
}

/**
 * 提交用户反馈请求
 */
export interface SubmitFeedbackRequest {
  tripId: string;
  userId: string;
  feedbackType: UserFeedbackType;
  data: UserFeedbackData;
}

@Injectable()
export class UserFeedbackService {
  private readonly logger = new Logger(UserFeedbackService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 提交用户反馈
   */
  async submitFeedback(request: SubmitFeedbackRequest): Promise<string> {
    this.logger.log(
      `[UserFeedback] 提交用户反馈: tripId=${request.tripId}, userId=${request.userId}, type=${request.feedbackType}`,
    );

    try {
      // 1. 评估数据质量
      const quality = this.assessFeedbackQuality(request);

      // 2. 只有质量评分 >= 0.7 的反馈才存储
      if (quality.overallScore < 0.7) {
        this.logger.warn(
          `[UserFeedback] 反馈质量评分过低，跳过存储: score=${quality.overallScore}`,
        );
        throw new Error(`Feedback quality score too low: ${quality.overallScore}`);
      }

      // 3. 存储用户反馈
      const feedback = await this.prisma.$executeRawUnsafe(`
        INSERT INTO user_feedback (
          trip_id, 
          user_id, 
          feedback_type, 
          feedback_data, 
          quality_score,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3::varchar,
          $4::jsonb,
          $5::double precision,
          NOW(),
          NOW()
        )
        RETURNING id
      `,
        request.tripId,
        request.userId,
        request.feedbackType,
        JSON.stringify(request.data),
        quality.overallScore,
      );

      const feedbackId = (feedback as any)[0]?.id;
      this.logger.log(`[UserFeedback] 用户反馈已存储: id=${feedbackId}`);

      return feedbackId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[UserFeedback] 提交用户反馈失败: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * 评估反馈数据质量
   */
  private assessFeedbackQuality(request: SubmitFeedbackRequest): UserFeedbackQuality {
    let completeness = 0;
    let consistency = 0;
    let credibility = 1.0; // 默认可信度

    const { feedbackType, data } = request;

    // 1. 完整性评估
    switch (feedbackType) {
      case 'TRIP_COMPLETED':
        completeness = this.calculateCompleteness([
          data.actualDays !== undefined,
          data.actualAscent !== undefined,
          data.overallSatisfaction !== undefined,
        ]);
        break;
      case 'POI_SKIPPED':
        completeness = this.calculateCompleteness([
          data.skippedPoiIds !== undefined && data.skippedPoiIds.length > 0,
          data.skipReason !== undefined,
        ]);
        break;
      case 'DAY_FAILED':
        completeness = this.calculateCompleteness([
          data.failedDayNumbers !== undefined && data.failedDayNumbers.length > 0,
          data.failureReason !== undefined,
        ]);
        break;
      case 'POI_ADDED':
        completeness = this.calculateCompleteness([
          data.addedPoiIds !== undefined && data.addedPoiIds.length > 0,
        ]);
        break;
    }

    // 2. 一致性评估（检查数据是否合理）
    consistency = this.assessConsistency(feedbackType, data);

    // 3. 可信度评估（基于历史数据）
    // TODO: 实现基于历史数据的可信度评估

    // 4. 综合评分
    const overallScore = (completeness * 0.4 + consistency * 0.4 + credibility * 0.2);

    return {
      completeness,
      consistency,
      credibility,
      overallScore,
    };
  }

  /**
   * 计算完整性
   */
  private calculateCompleteness(checks: boolean[]): number {
    const passed = checks.filter(Boolean).length;
    return passed / checks.length;
  }

  /**
   * 评估一致性
   */
  private assessConsistency(
    feedbackType: UserFeedbackType,
    data: UserFeedbackData,
  ): number {
    // 简单的一致性检查
    switch (feedbackType) {
      case 'TRIP_COMPLETED':
        // 检查满意度是否在合理范围内
        if (data.overallSatisfaction !== undefined) {
          if (data.overallSatisfaction < 1 || data.overallSatisfaction > 5) {
            return 0.5; // 不合理
          }
        }
        // 检查实际天数是否合理
        if (data.actualDays !== undefined) {
          if (data.actualDays < 1 || data.actualDays > 365) {
            return 0.5; // 不合理
          }
        }
        return 1.0; // 合理
      case 'POI_SKIPPED':
      case 'POI_ADDED':
        // 检查POI ID列表是否为空
        const poiIds = feedbackType === 'POI_SKIPPED' 
          ? data.skippedPoiIds 
          : data.addedPoiIds;
        if (poiIds && poiIds.length === 0) {
          return 0.5; // 不合理
        }
        return 1.0; // 合理
      case 'DAY_FAILED':
        // 检查失败日期是否合理
        if (data.failedDayNumbers) {
          const invalidDays = data.failedDayNumbers.filter(
            (day) => day < 1 || day > 365,
          );
          if (invalidDays.length > 0) {
            return 0.5; // 不合理
          }
        }
        return 1.0; // 合理
      default:
        return 1.0;
    }
  }

  /**
   * 获取用户反馈（按tripId）
   */
  async getFeedbackByTripId(tripId: string): Promise<any[]> {
    const feedbacks = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM user_feedback
      WHERE trip_id = $1::uuid
      ORDER BY created_at DESC
    `, tripId);

    return feedbacks as any[];
  }

  /**
   * 获取用户反馈（按userId）
   */
  async getFeedbackByUserId(userId: string): Promise<any[]> {
    const feedbacks = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM user_feedback
      WHERE user_id = $1::uuid
      ORDER BY created_at DESC
    `, userId);

    return feedbacks as any[];
  }
}
