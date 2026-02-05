// src/trips/decision/feedback/feedback-collector.service.ts

/**
 * Feedback Collector Service
 * 
 * 用户反馈收集服务
 * 收集用户对计划变体、约束冲突、权衡解释的反馈
 */

import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { DecisionRunLog } from '../decision-log';
import { ConstraintConflict } from '../constraints/constraint-dsl.types';
import { TripPlan } from '../plan-model';
import { ContextLearningService } from '../../../agent/context-engine/services/context-learning.service';

/**
 * 计划变体反馈
 */
export interface PlanVariantFeedback {
  /** 反馈ID */
  feedbackId: string;
  /** 行程ID */
  tripId?: string;
  /** 用户ID */
  userId?: string;
  /** 决策运行ID */
  runId: string;
  /** 变体ID */
  variantId: string;
  /** 变体策略 */
  variantStrategy: 'conservative' | 'balanced' | 'aggressive';
  /** 用户选择 */
  userChoice: 'selected' | 'rejected' | 'modified';
  /** 评分（1-5） */
  rating?: number;
  /** 反馈原因 */
  reason?: string;
  /** 反馈时间 */
  feedbackAt: Date;
}

/**
 * 约束冲突反馈
 */
export interface ConflictFeedback {
  /** 反馈ID */
  feedbackId: string;
  /** 行程ID */
  tripId?: string;
  /** 用户ID */
  userId?: string;
  /** 决策运行ID */
  runId: string;
  /** 冲突ID */
  conflictId: string;
  /** 冲突类型 */
  conflictType: string;
  /** 冲突是否被理解 */
  understood: boolean;
  /** 冲突解释是否清晰 */
  explanationClear: boolean;
  /** 权衡选项是否有用 */
  tradeoffOptionsUseful: boolean;
  /** 用户选择的权衡选项 */
  selectedTradeoffOption?: string;
  /** 反馈时间 */
  feedbackAt: Date;
}

/**
 * 决策质量反馈
 */
export interface DecisionQualityFeedback {
  /** 反馈ID */
  feedbackId: string;
  /** 行程ID */
  tripId?: string;
  /** 用户ID */
  userId?: string;
  /** 决策运行ID */
  runId: string;
  /** 整体满意度（1-5） */
  overallSatisfaction: number;
  /** 计划质量评分（1-5） */
  planQuality: number;
  /** 冲突解释质量（1-5） */
  conflictExplanationQuality?: number;
  /** 权衡选项质量（1-5） */
  tradeoffOptionsQuality?: number;
  /** 决策速度评分（1-5） */
  decisionSpeed?: number;
  /** 额外反馈 */
  additionalFeedback?: string;
  /** 反馈时间 */
  feedbackAt: Date;
}

@Injectable()
export class FeedbackCollectorService {
  private readonly logger = new Logger(FeedbackCollectorService.name);
  private contextLearningService?: ContextLearningService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * 收集计划变体反馈
   */
  async collectPlanVariantFeedback(
    feedback: PlanVariantFeedback
  ): Promise<void> {
    try {
      this.logger.debug(
        `[反馈收集] 计划变体反馈: variantId=${feedback.variantId}, ` +
        `strategy=${feedback.variantStrategy}, choice=${feedback.userChoice}, ` +
        `rating=${feedback.rating}`
      );

      // 存储到数据库
      await this.prisma.$executeRaw`
        INSERT INTO decision_plan_variant_feedback (
          feedback_id, run_id, variant_id, variant_strategy, user_choice,
          rating, reason, trip_id, user_id, feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.variantId}::VARCHAR,
          ${feedback.variantStrategy}::VARCHAR,
          ${feedback.userChoice}::VARCHAR,
          ${feedback.rating || null}::INTEGER,
          ${feedback.reason || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;

      // 如果用户选择了某个变体，记录成功案例
      if (feedback.userChoice === 'selected') {
        this.logger.log(
          `[反馈收集] 用户选择了变体: variantId=${feedback.variantId}, ` +
          `strategy=${feedback.variantStrategy}`
        );
      }

      // 如果用户拒绝了某个变体，记录失败案例
      if (feedback.userChoice === 'rejected') {
        this.logger.warn(
          `[反馈收集] 用户拒绝了变体: variantId=${feedback.variantId}, ` +
          `strategy=${feedback.variantStrategy}, reason=${feedback.reason}`
        );
      }
    } catch (error) {
      this.logger.error(
        `[反馈收集] 收集计划变体反馈失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * 收集约束冲突反馈
   */
  async collectConflictFeedback(
    feedback: ConflictFeedback
  ): Promise<void> {
    try {
      this.logger.debug(
        `[反馈收集] 约束冲突反馈: conflictId=${feedback.conflictId}, ` +
        `conflictType=${feedback.conflictType}, understood=${feedback.understood}, ` +
        `explanationClear=${feedback.explanationClear}, ` +
        `tradeoffOptionsUseful=${feedback.tradeoffOptionsUseful}`
      );

      // 存储到数据库
      await this.prisma.$executeRaw`
        INSERT INTO decision_conflict_feedback (
          feedback_id, run_id, conflict_id, conflict_type, understood,
          explanation_clear, tradeoff_options_useful, selected_tradeoff_option,
          trip_id, user_id, feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.conflictId}::VARCHAR,
          ${feedback.conflictType}::VARCHAR,
          ${feedback.understood}::BOOLEAN,
          ${feedback.explanationClear}::BOOLEAN,
          ${feedback.tradeoffOptionsUseful}::BOOLEAN,
          ${feedback.selectedTradeoffOption || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;

      // 如果用户不理解冲突，记录需要改进的地方
      if (!feedback.understood) {
        this.logger.warn(
          `[反馈收集] 用户不理解冲突: conflictId=${feedback.conflictId}, ` +
          `conflictType=${feedback.conflictType}`
        );
      }

      // 如果解释不清晰，记录需要改进的地方
      if (!feedback.explanationClear) {
        this.logger.warn(
          `[反馈收集] 冲突解释不清晰: conflictId=${feedback.conflictId}`
        );
      }

      // 如果权衡选项没用，记录需要改进的地方
      if (!feedback.tradeoffOptionsUseful) {
        this.logger.warn(
          `[反馈收集] 权衡选项没用: conflictId=${feedback.conflictId}`
        );
      }

      // 如果用户选择了某个权衡选项，记录成功案例
      if (feedback.selectedTradeoffOption) {
        this.logger.log(
          `[反馈收集] 用户选择了权衡选项: conflictId=${feedback.conflictId}, ` +
          `option=${feedback.selectedTradeoffOption}`
        );
      }
    } catch (error) {
      this.logger.error(
        `[反馈收集] 收集约束冲突反馈失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * 收集决策质量反馈
   */
  async collectDecisionQualityFeedback(
    feedback: DecisionQualityFeedback
  ): Promise<void> {
    try {
      this.logger.debug(
        `[反馈收集] 决策质量反馈: runId=${feedback.runId}, ` +
        `overallSatisfaction=${feedback.overallSatisfaction}, ` +
        `planQuality=${feedback.planQuality}`
      );

      // 存储到数据库
      await this.prisma.$executeRaw`
        INSERT INTO decision_quality_feedback (
          feedback_id, run_id, overall_satisfaction, plan_quality,
          conflict_explanation_quality, tradeoff_options_quality,
          decision_speed, additional_feedback, trip_id, user_id,
          feedback_at, created_at
        ) VALUES (
          ${feedback.feedbackId}::VARCHAR,
          ${feedback.runId}::VARCHAR,
          ${feedback.overallSatisfaction}::INTEGER,
          ${feedback.planQuality}::INTEGER,
          ${feedback.conflictExplanationQuality || null}::INTEGER,
          ${feedback.tradeoffOptionsQuality || null}::INTEGER,
          ${feedback.decisionSpeed || null}::INTEGER,
          ${feedback.additionalFeedback || null}::TEXT,
          ${feedback.tripId || null}::VARCHAR,
          ${feedback.userId || null}::VARCHAR,
          ${feedback.feedbackAt}::TIMESTAMPTZ,
          NOW()
        )
        ON CONFLICT (feedback_id) DO NOTHING
      `;

      // 如果满意度低，记录需要改进的地方
      if (feedback.overallSatisfaction < 3) {
        this.logger.warn(
          `[反馈收集] 用户满意度低: runId=${feedback.runId}, ` +
          `satisfaction=${feedback.overallSatisfaction}, ` +
          `additionalFeedback=${feedback.additionalFeedback}`
        );
      }

      // 如果计划质量低，记录需要改进的地方
      if (feedback.planQuality < 3) {
        this.logger.warn(
          `[反馈收集] 计划质量低: runId=${feedback.runId}, ` +
          `planQuality=${feedback.planQuality}`
        );
      }

      // 🔴 P1: 记录user_feedback事件到context.learn
      // 异步执行，不阻塞主流程
      this.recordUserFeedbackEvent(feedback).catch((error) => {
        this.logger.warn(`记录用户反馈学习事件失败: ${error.message}`, error.stack);
      });
    } catch (error) {
      this.logger.error(
        `[反馈收集] 收集决策质量反馈失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * 批量收集反馈
   */
  async collectBatchFeedback(
    planVariantFeedbacks?: PlanVariantFeedback[],
    conflictFeedbacks?: ConflictFeedback[],
    decisionQualityFeedbacks?: DecisionQualityFeedback[]
  ): Promise<void> {
    try {
      const promises: Promise<void>[] = [];

      if (planVariantFeedbacks) {
        for (const feedback of planVariantFeedbacks) {
          promises.push(this.collectPlanVariantFeedback(feedback));
        }
      }

      if (conflictFeedbacks) {
        for (const feedback of conflictFeedbacks) {
          promises.push(this.collectConflictFeedback(feedback));
        }
      }

      if (decisionQualityFeedbacks) {
        for (const feedback of decisionQualityFeedbacks) {
          promises.push(this.collectDecisionQualityFeedback(feedback));
        }
      }

      await Promise.all(promises);

      this.logger.log(
        `[反馈收集] 批量收集完成: ` +
        `planVariant=${planVariantFeedbacks?.length || 0}, ` +
        `conflict=${conflictFeedbacks?.length || 0}, ` +
        `decisionQuality=${decisionQualityFeedbacks?.length || 0}`
      );
    } catch (error) {
      this.logger.error(
        `[反馈收集] 批量收集失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * 获取用户反馈统计
   */
  async getFeedbackStats(
    userId?: string,
    tripId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    planVariantCount: number;
    conflictCount: number;
    decisionQualityCount: number;
    averageSatisfaction: number;
    averagePlanQuality: number;
  }> {
    try {
      this.logger.debug(
        `[反馈收集] 获取反馈统计: userId=${userId}, tripId=${tripId}`
      );

      // 构建查询条件（使用 Prisma 的 $queryRawUnsafe 支持动态 SQL）
      const conditions: string[] = [];
      const params: any[] = [];

      if (userId) {
        conditions.push(`user_id = $${params.length + 1}`);
        params.push(userId);
      }

      if (tripId) {
        conditions.push(`trip_id = $${params.length + 1}`);
        params.push(tripId);
      }

      if (startDate) {
        conditions.push(`feedback_at >= $${params.length + 1}`);
        params.push(startDate);
      }

      if (endDate) {
        conditions.push(`feedback_at <= $${params.length + 1}`);
        params.push(endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询计划变体反馈数量
      const planVariantQuery = `
        SELECT COUNT(*)::bigint as count
        FROM decision_plan_variant_feedback
        ${whereClause}
      `;
      const planVariantResult = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        planVariantQuery,
        ...params
      );
      const planVariantCount = Number(planVariantResult[0]?.count || 0);

      // 查询约束冲突反馈数量
      const conflictQuery = `
        SELECT COUNT(*)::bigint as count
        FROM decision_conflict_feedback
        ${whereClause}
      `;
      const conflictResult = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        conflictQuery,
        ...params
      );
      const conflictCount = Number(conflictResult[0]?.count || 0);

      // 查询决策质量反馈数量和平均值
      const qualityQuery = `
        SELECT 
          COUNT(*)::bigint as count,
          AVG(overall_satisfaction)::numeric as avg_satisfaction,
          AVG(plan_quality)::numeric as avg_plan_quality
        FROM decision_quality_feedback
        ${whereClause}
      `;
      const qualityResult = await this.prisma.$queryRawUnsafe<Array<{
        count: bigint;
        avg_satisfaction: number;
        avg_plan_quality: number;
      }>>(qualityQuery, ...params);
      const decisionQualityCount = Number(qualityResult[0]?.count || 0);
      const averageSatisfaction = Number(qualityResult[0]?.avg_satisfaction || 0);
      const averagePlanQuality = Number(qualityResult[0]?.avg_plan_quality || 0);

      return {
        planVariantCount,
        conflictCount,
        decisionQualityCount,
        averageSatisfaction,
        averagePlanQuality,
      };
    } catch (error) {
      this.logger.error(
        `[反馈收集] 获取反馈统计失败: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * 记录用户反馈事件到context.learn
   * 用于学习哪些Context Block更相关、更重要
   */
  private async recordUserFeedbackEvent(
    feedback: DecisionQualityFeedback,
  ): Promise<void> {
    try {
      // 懒加载获取ContextLearningService
      if (!this.contextLearningService) {
        try {
          this.contextLearningService = this.moduleRef.get(ContextLearningService, { strict: false });
        } catch (error) {
          this.logger.debug('ContextLearningService 不可用，跳过用户反馈学习事件记录');
          return;
        }
      }

      if (!this.contextLearningService) {
        return;
      }

      // 从additionalFeedback中尝试提取Block相关信息（如果有）
      // 这里简化处理，主要记录满意度信息
      // 未来可以从additionalFeedback中解析出relevantBlocks、irrelevantBlocks等
      const feedbackText = feedback.additionalFeedback || '';
      
      // 简单的关键词匹配，提取Block相关信息（可选）
      const relevantBlocks: string[] = [];
      const irrelevantBlocks: string[] = [];
      const missingBlocks: string[] = [];

      // 如果满意度高（>=4），可以认为当前Context Block是相关的
      // 如果满意度低（<3），可以认为某些Block可能不相关或缺失
      if (feedback.overallSatisfaction >= 4) {
        // 高满意度：当前Context Block是相关的
        // 这里简化处理，不具体提取Block名称
      } else if (feedback.overallSatisfaction < 3) {
        // 低满意度：可能需要改进Context Block
        // 可以从additionalFeedback中提取信息（未来增强）
      }

      // 记录学习事件
      await this.contextLearningService.learn({
        userId: feedback.userId || undefined,
        tripId: feedback.tripId || undefined,
        eventType: 'user_feedback',
        eventData: {
          feedback: {
            relevantBlocks: relevantBlocks.length > 0 ? relevantBlocks : undefined,
            irrelevantBlocks: irrelevantBlocks.length > 0 ? irrelevantBlocks : undefined,
            missingBlocks: missingBlocks.length > 0 ? missingBlocks : undefined,
          },
        },
        phase: 'PLANNING', // 默认阶段，未来可以从runId中获取
        agent: 'PlanningWorkbench',
      });

      this.logger.debug(
        `已记录用户反馈学习事件: runId=${feedback.runId}, tripId=${feedback.tripId || 'none'}, satisfaction=${feedback.overallSatisfaction}`,
      );
    } catch (error: any) {
      // 记录事件失败不应该影响主流程，只记录警告
      this.logger.warn(`记录用户反馈学习事件失败: ${error.message}`);
    }
  }
}
