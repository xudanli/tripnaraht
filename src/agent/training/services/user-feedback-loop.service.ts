// src/agent/training/services/user-feedback-loop.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  UserActionTracking,
  UserFeedback,
  FeedbackAnalysis,
  UserActionType,
} from '../interfaces/product.interface';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { randomUUID } from 'crypto';

/**
 * UserFeedbackLoopService
 * 
 * 职责：实现埋点与用户反馈闭环（采纳/编辑/导出/放弃）
 * 
 * 功能：
 * 1. trackUserAction() - 追踪用户行为
 * 2. collectFeedback() - 收集用户反馈
 * 3. analyzeFeedback() - 分析用户反馈
 * 4. applyFeedbackToReward() - 将反馈应用到Reward计算
 */
@Injectable()
export class UserFeedbackLoopService {
  private readonly logger = new Logger(UserFeedbackLoopService.name);
  private readonly actions: Map<string, UserActionTracking> = new Map();
  private readonly feedbacks: Map<string, UserFeedback> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rewardExtractor: RewardSignalExtractorService,
  ) {}

  /**
   * 追踪用户行为
   */
  async trackUserAction(
    userId: string | undefined,
    actionType: UserActionType,
    context: {
      request_id: string;
      plan_id?: string;
      decision_id?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<UserActionTracking> {
    this.logger.debug(
      `[UserFeedbackLoop] 追踪用户行为: actionType=${actionType}, requestId=${context.request_id}`,
    );

    const action: UserActionTracking = {
      action_id: `action_${randomUUID()}`,
      user_id: userId,
      request_id: context.request_id,
      plan_id: context.plan_id,
      decision_id: context.decision_id,
      action_type: actionType,
      timestamp: new Date().toISOString(),
      metadata: context.metadata || {},
    };

    this.actions.set(action.action_id, action);

    // TODO: 发送到分析服务（Analytics Service）
    // await this.analyticsService.track(action);

    this.logger.log(
      `[UserFeedbackLoop] 用户行为已追踪: actionId=${action.action_id}, actionType=${actionType}`,
    );

    return action;
  }

  /**
   * 收集用户反馈
   */
  async collectFeedback(
    userId: string | undefined,
    requestId: string,
    planId: string | undefined,
    feedback: {
      satisfaction?: number;
      comments?: string;
      issues?: string[];
    },
  ): Promise<UserFeedback> {
    this.logger.debug(
      `[UserFeedbackLoop] 收集用户反馈: requestId=${requestId}, satisfaction=${feedback.satisfaction}`,
    );

    const userFeedback: UserFeedback = {
      feedback_id: `feedback_${randomUUID()}`,
      user_id: userId,
      request_id: requestId,
      plan_id: planId,
      satisfaction: feedback.satisfaction,
      comments: feedback.comments,
      issues: feedback.issues,
      timestamp: new Date().toISOString(),
      metadata: {},
    };

    this.feedbacks.set(userFeedback.feedback_id, userFeedback);

    // TODO: 发送到分析服务
    // await this.analyticsService.track(userFeedback);

    this.logger.log(
      `[UserFeedbackLoop] 用户反馈已收集: feedbackId=${userFeedback.feedback_id}`,
    );

    return userFeedback;
  }

  /**
   * 分析用户反馈
   */
  async analyzeFeedback(
    startDate: string,
    endDate: string,
  ): Promise<FeedbackAnalysis> {
    this.logger.log(
      `[UserFeedbackLoop] 分析用户反馈: startDate=${startDate}, endDate=${endDate}`,
    );

    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    // 筛选时间范围内的反馈
    const periodFeedbacks = Array.from(this.feedbacks.values()).filter((f) => {
      const feedbackTime = new Date(f.timestamp).getTime();
      return feedbackTime >= startTime && feedbackTime <= endTime;
    });

    // 筛选时间范围内的行为
    const periodActions = Array.from(this.actions.values()).filter((a) => {
      const actionTime = new Date(a.timestamp).getTime();
      return actionTime >= startTime && actionTime <= endTime;
    });

    // 计算平均满意度
    const satisfactions = periodFeedbacks
      .filter((f) => f.satisfaction !== undefined)
      .map((f) => f.satisfaction!);
    const avgSatisfaction =
      satisfactions.length > 0
        ? satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length
        : 0;

    // 行为分布统计
    const actionDistribution: Record<UserActionType, number> = {
      ADOPT: 0,
      EDIT: 0,
      EXPORT: 0,
      ABANDON: 0,
      FEEDBACK: 0,
    };

    for (const action of periodActions) {
      actionDistribution[action.action_type] =
        (actionDistribution[action.action_type] || 0) + 1;
    }

    // 常见问题统计
    const issueCounts: Record<string, number> = {};
    for (const feedback of periodFeedbacks) {
      if (feedback.issues) {
        for (const issue of feedback.issues) {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        }
      }
    }

    const commonIssues = Object.entries(issueCounts)
      .map(([issue, count]) => ({
        issue,
        count,
        percentage: (count / periodFeedbacks.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Top 10

    // 趋势分析（简化实现）
    const satisfactionTrend = this.calculateTrend(satisfactions);
    const adoptionRateTrend = this.calculateTrend(
      periodActions.filter((a) => a.action_type === 'ADOPT').map(() => 1),
    );

    const analysis: FeedbackAnalysis = {
      period_start: startDate,
      period_end: endDate,
      total_feedbacks: periodFeedbacks.length,
      avg_satisfaction: avgSatisfaction,
      action_distribution: actionDistribution,
      common_issues: commonIssues,
      trends: {
        satisfaction_trend: satisfactionTrend,
        adoption_rate_trend: adoptionRateTrend,
      },
    };

    this.logger.log(
      `[UserFeedbackLoop] 反馈分析完成: totalFeedbacks=${periodFeedbacks.length}, avgSatisfaction=${avgSatisfaction.toFixed(2)}`,
    );

    return analysis;
  }

  /**
   * 将反馈应用到Reward计算
   */
  async applyFeedbackToReward(
    requestId: string,
  ): Promise<{ reward_signals: any[]; total_reward: number }> {
    this.logger.debug(
      `[UserFeedbackLoop] 将反馈应用到Reward: requestId=${requestId}`,
    );

    // 获取该请求的所有行为和反馈
    const actions = Array.from(this.actions.values()).filter(
      (a) => a.request_id === requestId,
    );
    const feedbacks = Array.from(this.feedbacks.values()).filter(
      (f) => f.request_id === requestId,
    );

    const rewardSignals: any[] = [];

    // 从行为提取reward信号
    for (const action of actions) {
      switch (action.action_type) {
        case 'ADOPT':
          rewardSignals.push({
            type: 'USER_APPROVAL',
            value: 1.0,
            timestamp: action.timestamp,
            metadata: { action_type: 'ADOPT' },
          });
          break;
        case 'ABANDON':
          rewardSignals.push({
            type: 'USER_APPROVAL',
            value: -0.5,
            timestamp: action.timestamp,
            metadata: { action_type: 'ABANDON' },
          });
          break;
        case 'EXPORT':
          rewardSignals.push({
            type: 'PLAN_COMMIT',
            value: 0.8,
            timestamp: action.timestamp,
            metadata: { action_type: 'EXPORT' },
          });
          break;
      }
    }

    // 从反馈提取reward信号
    for (const feedback of feedbacks) {
      if (feedback.satisfaction !== undefined) {
        // 将满意度（1-5）转换为reward（0-1）
        const satisfactionReward = (feedback.satisfaction - 1) / 4; // 1->0, 5->1
        rewardSignals.push({
          type: 'DECISION_ALIGNMENT',
          value: satisfactionReward,
          timestamp: feedback.timestamp,
          metadata: {
            satisfaction: feedback.satisfaction,
            comments: feedback.comments,
          },
        });
      }
    }

    // 计算总reward
    const totalReward = rewardSignals.reduce((sum, s) => sum + s.value, 0);

    this.logger.log(
      `[UserFeedbackLoop] 反馈已应用到Reward: requestId=${requestId}, totalReward=${totalReward.toFixed(3)}`,
    );

    return {
      reward_signals: rewardSignals,
      total_reward: totalReward,
    };
  }

  /**
   * 计算趋势
   */
  private calculateTrend(values: number[]): 'INCREASING' | 'DECREASING' | 'STABLE' {
    if (values.length < 2) return 'STABLE';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg =
      firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg =
      secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    const threshold = 0.1; // 10%变化阈值

    if (diff > threshold) return 'INCREASING';
    if (diff < -threshold) return 'DECREASING';
    return 'STABLE';
  }
}
