// src/agent/assistants/trip-planner/services/trip-planner-feedback.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * 规划助手问答反馈接口
 */
export interface TripPlannerFeedback {
  questionId: string;
  sessionId?: string;
  tripId?: string;
  userId?: string;
  question?: string;
  answer?: string;
  helpful: boolean;
  rating?: number;
  comment?: string;
  actionTaken?: string;
  source?: 'RAG' | 'RAG+LLM' | 'LLM';
  ragConfidence?: number;
  processingTimeMs?: number;
}

/**
 * 反馈分析结果
 */
export interface FeedbackAnalysis {
  periodStart: Date;
  periodEnd: Date;
  totalFeedback: number;
  helpfulCount: number;
  notHelpfulCount: number;
  averageRating: number;
  averageRagConfidence: number;
  sourceDistribution: {
    RAG: number;
    'RAG+LLM': number;
    LLM: number;
  };
  commonIssues: Array<{
    issue: string;
    count: number;
  }>;
}

/**
 * 规划助手反馈服务
 * 
 * 职责：
 * 1. 存储用户反馈
 * 2. 分析反馈数据
 * 3. 触发改进流程（负面反馈）
 */
@Injectable()
export class TripPlannerFeedbackService {
  private readonly logger = new Logger(TripPlannerFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 保存反馈
   */
  async saveFeedback(feedback: TripPlannerFeedback): Promise<void> {
    try {
      // 使用原始 SQL 插入（因为 Prisma schema 可能还没有这个模型）
      await this.prisma.$executeRaw`
        INSERT INTO trip_planner_feedback (
          question_id, session_id, trip_id, user_id,
          question, answer, helpful, rating, comment, action_taken,
          source, rag_confidence, processing_time_ms, created_at
        ) VALUES (
          ${feedback.questionId}::VARCHAR,
          ${feedback.sessionId || null}::VARCHAR,
          ${feedback.tripId || null}::VARCHAR, -- Trip.id 是 String 类型
          ${feedback.userId || null}::UUID,
          ${feedback.question || null}::TEXT,
          ${feedback.answer || null}::TEXT,
          ${feedback.helpful}::BOOLEAN,
          ${feedback.rating || null}::INTEGER,
          ${feedback.comment || null}::TEXT,
          ${feedback.actionTaken || null}::VARCHAR,
          ${feedback.source || null}::VARCHAR,
          ${feedback.ragConfidence || null}::FLOAT,
          ${feedback.processingTimeMs || null}::INTEGER,
          NOW()
        )
      `;

      this.logger.debug(`[反馈服务] 反馈已保存: questionId=${feedback.questionId}, helpful=${feedback.helpful}`);
    } catch (error: any) {
      this.logger.error(`[反馈服务] 保存反馈失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 分析反馈数据
   */
  async analyzeFeedback(
    startDate: Date,
    endDate: Date
  ): Promise<FeedbackAnalysis> {
    try {
      const result = await this.prisma.$queryRaw<Array<{
        total_feedback: bigint;
        helpful_count: bigint;
        not_helpful_count: bigint;
        avg_rating: number;
        avg_rag_confidence: number;
        rag_count: bigint;
        rag_llm_count: bigint;
        llm_count: bigint;
      }>>`
        SELECT 
          COUNT(*) as total_feedback,
          COUNT(*) FILTER (WHERE helpful = true) as helpful_count,
          COUNT(*) FILTER (WHERE helpful = false) as not_helpful_count,
          AVG(rating) as avg_rating,
          AVG(rag_confidence) as avg_rag_confidence,
          COUNT(*) FILTER (WHERE source = 'RAG') as rag_count,
          COUNT(*) FILTER (WHERE source = 'RAG+LLM') as rag_llm_count,
          COUNT(*) FILTER (WHERE source = 'LLM') as llm_count
        FROM trip_planner_feedback
        WHERE created_at >= ${startDate}::TIMESTAMPTZ
          AND created_at <= ${endDate}::TIMESTAMPTZ
      `;

      const stats = result[0] || {
        total_feedback: BigInt(0),
        helpful_count: BigInt(0),
        not_helpful_count: BigInt(0),
        avg_rating: 0,
        avg_rag_confidence: 0,
        rag_count: BigInt(0),
        rag_llm_count: BigInt(0),
        llm_count: BigInt(0),
      };

      // 获取常见问题（负面反馈的评论）
      const commonIssues = await this.prisma.$queryRaw<Array<{
        issue: string;
        count: bigint;
      }>>`
        SELECT 
          comment as issue,
          COUNT(*) as count
        FROM trip_planner_feedback
        WHERE created_at >= ${startDate}::TIMESTAMPTZ
          AND created_at <= ${endDate}::TIMESTAMPTZ
          AND helpful = false
          AND comment IS NOT NULL
          AND comment != ''
        GROUP BY comment
        ORDER BY count DESC
        LIMIT 10
      `;

      return {
        periodStart: startDate,
        periodEnd: endDate,
        totalFeedback: Number(stats.total_feedback),
        helpfulCount: Number(stats.helpful_count),
        notHelpfulCount: Number(stats.not_helpful_count),
        averageRating: stats.avg_rating || 0,
        averageRagConfidence: stats.avg_rag_confidence || 0,
        sourceDistribution: {
          RAG: Number(stats.rag_count),
          'RAG+LLM': Number(stats.rag_llm_count),
          LLM: Number(stats.llm_count),
        },
        commonIssues: commonIssues.map(i => ({
          issue: i.issue,
          count: Number(i.count),
        })),
      };
    } catch (error: any) {
      this.logger.error(`[反馈服务] 分析反馈失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 触发改进流程（负面反馈）
   */
  async triggerImprovement(feedback: TripPlannerFeedback): Promise<void> {
    this.logger.warn(`[反馈服务] 触发改进流程: questionId=${feedback.questionId}, rating=${feedback.rating}`);

    // TODO: 实现改进流程
    // 1. 分析负面反馈原因
    // 2. 更新 RAG 检索策略
    // 3. 优化提示词
    // 4. 记录改进日志

    // 临时：记录日志
    this.logger.debug(`[反馈服务] 负面反馈详情:`, {
      questionId: feedback.questionId,
      question: feedback.question,
      answer: feedback.answer?.substring(0, 100),
      helpful: feedback.helpful,
      rating: feedback.rating,
      comment: feedback.comment,
      source: feedback.source,
      ragConfidence: feedback.ragConfidence,
    });
  }

  /**
   * 获取反馈统计（最近 N 天）
   */
  async getFeedbackStats(days: number = 7): Promise<FeedbackAnalysis> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.analyzeFeedback(startDate, endDate);
  }
}
