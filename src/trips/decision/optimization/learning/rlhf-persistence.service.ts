/**
 * RLHF 持久化服务
 *
 * P0.2 优化：RLHF 反馈数据持久化，支持数据飞轮
 *
 * 功能：
 * 1. 反馈记录批量写入数据库
 * 2. 学习收敛日志追踪
 * 3. 数据导出用于离线分析
 *
 * 专利实现：支持 θ_{k+1} = θ_k − η ∇_θ L 学习闭环
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FeedbackRecord } from './weight-learner.service';
import { ObjectiveFunctionWeights } from '../objective-function.interface';

export interface RlhfFeedbackPersistInput {
  userId: string;
  tripId: string;
  feedbackType: string;
  feedbackData: Record<string, unknown>;
  weightsAtTime: ObjectiveFunctionWeights;
  utilityAtTime: number;
  contextHash?: string;
}

export interface LearningConvergenceInput {
  userId: string;
  round: number;
  utility: number;
  optimalUtility: number;
  regret: number;
  cumulativeRegret: number;
  theoreticalBound: number;
}

export interface FeedbackQueryOptions {
  userId?: string;
  tripId?: string;
  feedbackType?: string;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface FeedbackStats {
  totalRecords: number;
  uniqueUsers: number;
  uniqueTrips: number;
  feedbackTypeBreakdown: Record<string, number>;
  avgUtility: number;
  dateRange: { earliest: Date | null; latest: Date | null };
}

@Injectable()
export class RlhfPersistenceService {
  private readonly logger = new Logger(RlhfPersistenceService.name);
  private writeBuffer: RlhfFeedbackPersistInput[] = [];
  private readonly bufferFlushSize = 100;
  private readonly bufferFlushIntervalMs = 30000;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    if (prisma) {
      this.logger.log('[RlhfPersistence] Prisma 服务已注入，启用数据库持久化');
      this.startBufferFlushTimer();
    } else {
      this.logger.warn('[RlhfPersistence] Prisma 服务不可用，数据将仅保存在内存');
    }
  }

  /**
   * 记录单条反馈（异步批量写入）
   */
  async recordFeedback(input: RlhfFeedbackPersistInput): Promise<void> {
    this.writeBuffer.push(input);

    if (this.writeBuffer.length >= this.bufferFlushSize) {
      await this.flushBuffer();
    }
  }

  /**
   * 批量记录反馈（立即写入）
   */
  async recordFeedbackBatch(inputs: RlhfFeedbackPersistInput[]): Promise<number> {
    if (!this.prisma) {
      this.logger.debug(`[RlhfPersistence] 跳过批量写入（无 Prisma）: ${inputs.length} 条`);
      return 0;
    }

    try {
      const result = await this.prisma.rlhfFeedbackRecord.createMany({
        data: inputs.map((input) => ({
          userId: input.userId,
          tripId: input.tripId,
          feedbackType: input.feedbackType,
          feedbackData: input.feedbackData as object,
          weightsAtTime: input.weightsAtTime as object,
          utilityAtTime: input.utilityAtTime,
          contextHash: input.contextHash ?? null,
        })),
        skipDuplicates: true,
      });

      this.logger.debug(`[RlhfPersistence] 批量写入成功: ${result.count} 条`);
      return result.count;
    } catch (error) {
      this.logger.error(`[RlhfPersistence] 批量写入失败`, error);
      throw error;
    }
  }

  /**
   * 从 FeedbackRecord 转换并持久化
   */
  async persistFeedbackRecord(record: FeedbackRecord): Promise<void> {
    await this.recordFeedback({
      userId: record.userId,
      tripId: record.tripId,
      feedbackType: record.type,
      feedbackData: record.data,
      weightsAtTime: record.weightsAtTime,
      utilityAtTime: record.utilityAtTime,
    });
  }

  /**
   * 记录学习收敛日志
   */
  async recordConvergence(input: LearningConvergenceInput): Promise<void> {
    if (!this.prisma) {
      this.logger.debug('[RlhfPersistence] 跳过收敛日志（无 Prisma）');
      return;
    }

    try {
      await this.prisma.learningConvergenceLog.create({
        data: {
          userId: input.userId,
          round: input.round,
          utility: input.utility,
          optimalUtility: input.optimalUtility,
          regret: input.regret,
          cumulativeRegret: input.cumulativeRegret,
          theoreticalBound: input.theoreticalBound,
        },
      });

      this.logger.debug(
        `[RlhfPersistence] 收敛日志: userId=${input.userId}, round=${input.round}, regret=${input.regret.toFixed(4)}`,
      );
    } catch (error) {
      this.logger.error('[RlhfPersistence] 收敛日志写入失败', error);
    }
  }

  /**
   * 查询反馈记录
   */
  async queryFeedback(options: FeedbackQueryOptions): Promise<RlhfFeedbackPersistInput[]> {
    if (!this.prisma) {
      return [];
    }

    try {
      const where: Record<string, unknown> = {};

      if (options.userId) where.userId = options.userId;
      if (options.tripId) where.tripId = options.tripId;
      if (options.feedbackType) where.feedbackType = options.feedbackType;
      if (options.since || options.until) {
        where.createdAt = {};
        if (options.since) (where.createdAt as any).gte = options.since;
        if (options.until) (where.createdAt as any).lte = options.until;
      }

      const records = await this.prisma.rlhfFeedbackRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit ?? 100,
        skip: options.offset ?? 0,
      });

      return records.map((r) => ({
        userId: r.userId,
        tripId: r.tripId,
        feedbackType: r.feedbackType,
        feedbackData: r.feedbackData as Record<string, unknown>,
        weightsAtTime: r.weightsAtTime as unknown as ObjectiveFunctionWeights,
        utilityAtTime: r.utilityAtTime,
        contextHash: r.contextHash ?? undefined,
      }));
    } catch (error) {
      this.logger.error('[RlhfPersistence] 查询失败', error);
      return [];
    }
  }

  /**
   * 获取用户学习收敛历史
   */
  async getConvergenceHistory(
    userId: string,
    options?: { limit?: number; since?: Date },
  ): Promise<LearningConvergenceInput[]> {
    if (!this.prisma) {
      return [];
    }

    try {
      const where: Record<string, unknown> = { userId };
      if (options?.since) {
        where.createdAt = { gte: options.since };
      }

      const logs = await this.prisma.learningConvergenceLog.findMany({
        where,
        orderBy: { round: 'asc' },
        take: options?.limit ?? 1000,
      });

      return logs.map((l) => ({
        userId: l.userId,
        round: l.round,
        utility: l.utility,
        optimalUtility: l.optimalUtility,
        regret: l.regret,
        cumulativeRegret: l.cumulativeRegret,
        theoreticalBound: l.theoreticalBound,
      }));
    } catch (error) {
      this.logger.error('[RlhfPersistence] 获取收敛历史失败', error);
      return [];
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<FeedbackStats> {
    if (!this.prisma) {
      return {
        totalRecords: 0,
        uniqueUsers: 0,
        uniqueTrips: 0,
        feedbackTypeBreakdown: {},
        avgUtility: 0,
        dateRange: { earliest: null, latest: null },
      };
    }

    try {
      const [countResult, typeBreakdown, avgUtility, dateRange] = await Promise.all([
        this.prisma.rlhfFeedbackRecord.aggregate({
          _count: { id: true },
        }),
        this.prisma.rlhfFeedbackRecord.groupBy({
          by: ['feedbackType'],
          _count: { id: true },
        }),
        this.prisma.rlhfFeedbackRecord.aggregate({
          _avg: { utilityAtTime: true },
        }),
        this.prisma.rlhfFeedbackRecord.aggregate({
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
      ]);

      const uniqueUsers = await this.prisma.rlhfFeedbackRecord.findMany({
        distinct: ['userId'],
        select: { userId: true },
      });

      const uniqueTrips = await this.prisma.rlhfFeedbackRecord.findMany({
        distinct: ['tripId'],
        select: { tripId: true },
      });

      const breakdown: Record<string, number> = {};
      for (const item of typeBreakdown) {
        breakdown[item.feedbackType] = item._count.id;
      }

      return {
        totalRecords: countResult._count.id,
        uniqueUsers: uniqueUsers.length,
        uniqueTrips: uniqueTrips.length,
        feedbackTypeBreakdown: breakdown,
        avgUtility: avgUtility._avg.utilityAtTime ?? 0,
        dateRange: {
          earliest: dateRange._min.createdAt,
          latest: dateRange._max.createdAt,
        },
      };
    } catch (error) {
      this.logger.error('[RlhfPersistence] 获取统计失败', error);
      return {
        totalRecords: 0,
        uniqueUsers: 0,
        uniqueTrips: 0,
        feedbackTypeBreakdown: {},
        avgUtility: 0,
        dateRange: { earliest: null, latest: null },
      };
    }
  }

  /**
   * 导出数据用于离线分析
   */
  async exportForAnalysis(options: {
    userId?: string;
    since?: Date;
    until?: Date;
  }): Promise<{
    feedback: RlhfFeedbackPersistInput[];
    convergence: LearningConvergenceInput[];
  }> {
    const feedback = await this.queryFeedback({
      userId: options.userId,
      since: options.since,
      until: options.until,
      limit: 10000,
    });

    const convergence = options.userId
      ? await this.getConvergenceHistory(options.userId, { since: options.since })
      : [];

    return { feedback, convergence };
  }

  /**
   * 清理旧数据
   */
  async cleanup(olderThanDays: number = 90): Promise<{ deletedFeedback: number; deletedLogs: number }> {
    if (!this.prisma) {
      return { deletedFeedback: 0, deletedLogs: 0 };
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    try {
      const [feedbackResult, logsResult] = await Promise.all([
        this.prisma.rlhfFeedbackRecord.deleteMany({
          where: { createdAt: { lt: cutoff } },
        }),
        this.prisma.learningConvergenceLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        }),
      ]);

      this.logger.log(
        `[RlhfPersistence] 清理完成: 删除 ${feedbackResult.count} 条反馈, ${logsResult.count} 条日志`,
      );

      return {
        deletedFeedback: feedbackResult.count,
        deletedLogs: logsResult.count,
      };
    } catch (error) {
      this.logger.error('[RlhfPersistence] 清理失败', error);
      return { deletedFeedback: 0, deletedLogs: 0 };
    }
  }

  /**
   * 强制刷新缓冲区
   */
  async flushBuffer(): Promise<number> {
    if (this.writeBuffer.length === 0) {
      return 0;
    }

    const toWrite = [...this.writeBuffer];
    this.writeBuffer = [];

    return this.recordFeedbackBatch(toWrite);
  }

  private startBufferFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      if (this.writeBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, this.bufferFlushIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    if (this.writeBuffer.length > 0) {
      await this.flushBuffer();
    }

    this.logger.log('[RlhfPersistence] 服务关闭，缓冲区已刷新');
  }
}
