/**
 * Feedback Learning Scheduler（Scheme D 第 4 层）
 *
 * 定期任务：从 1–3 层数据更新 userParameters、权重、Block 重要性
 * 默认每日 03:00 UTC 执行
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { WeightLearnerService, type FeedbackRecord } from '../../trips/decision/optimization/learning/weight-learner.service';
import { WeightPersistenceService } from '../../trips/decision/optimization/learning/weight-persistence.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../../trips/decision/optimization/objective-function.interface';
import { ContextLearningService } from '../../agent/context-engine/services/context-learning.service';
import type { ContextBlock, BlockType } from '../../agent/context-engine/types/context-package.types';

@Injectable()
export class FeedbackLearningSchedulerService {
  private readonly logger = new Logger(FeedbackLearningSchedulerService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly weightLearner?: WeightLearnerService,
    @Optional() private readonly contextLearning?: ContextLearningService,
    @Optional() private readonly weightPersistence?: WeightPersistenceService,
  ) {}

  /**
   * 每日 03:00 UTC 运行学习任务
   * 可通过 FEEDBACK_LEARNING_CRON_ENABLED=false 禁用
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'feedback-learning',
    timeZone: 'UTC',
  })
  async runScheduledLearning(): Promise<void> {
    if (process.env.FEEDBACK_LEARNING_CRON_ENABLED === 'false') {
      this.logger.debug('[FeedbackLearning] Cron 已禁用');
      return;
    }
    if (!this.prisma || !this.weightLearner) {
      this.logger.debug('[FeedbackLearning] Prisma 或 WeightLearner 未注入，跳过');
      return;
    }

    try {
      this.logger.log('[FeedbackLearning] 开始定期学习任务');
      const result = await this.runLearningFromRlhfOutcomes();
      this.logger.log(`[FeedbackLearning] 完成: ${JSON.stringify(result)}`);
    } catch (e: unknown) {
      this.logger.error(`[FeedbackLearning] 学习任务失败: ${(e as Error)?.message}`);
    }
  }

  /**
   * 从 RLHF feedback signals 的 outcomeCapture 构建 FeedbackRecord 并触发学习
   */
  private async runLearningFromRlhfOutcomes(): Promise<{
    usersProcessed: number;
    totalSamples: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let usersProcessed = 0;
    let totalSamples = 0;

    const minSignals = Math.max(
      1,
      parseInt(process.env.FEEDBACK_LEARNING_MIN_SIGNALS ?? '10', 10) || 10,
    );

    const signals = await this.prisma!.$queryRaw<
      Array<{ user_id: string | null; trip_run_id: string; context: unknown }>
    >`
      SELECT user_id, trip_run_id, context
      FROM rlhf_feedback_signals
      WHERE context ? 'outcomeCapture'
        AND timestamp > NOW() - INTERVAL '90 days'
      ORDER BY timestamp DESC
      LIMIT 500
    `;

    const byUser = new Map<string, FeedbackRecord[]>();
    for (const row of signals) {
      const userId = row.user_id ?? 'anonymous';
      const ctx = row.context as Record<string, unknown>;
      const oc = ctx?.outcomeCapture as Record<string, unknown> | undefined;
      if (!oc) continue;

      const record = this.outcomeCaptureToFeedbackRecord(
        oc,
        userId,
        row.trip_run_id,
        `outcome_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      );
      const list = byUser.get(userId) ?? [];
      list.push(record);
      byUser.set(userId, list);
    }

    for (const [userId, feedback] of byUser) {
      if (feedback.length < minSignals) continue;
      try {
        const result = await this.weightLearner!.learnFromFeedback(userId, feedback);
        usersProcessed++;
        totalSamples += result.samplesUsed;

        const hasChange = Object.values(result.weightChanges).some(
          (v) => typeof v === 'number' && Math.abs(v) > 1e-8,
        );
        if (this.weightPersistence && hasChange) {
          try {
            const existing = await this.weightPersistence.loadUserProfile(userId);
            await this.weightPersistence.saveUserProfile(userId, {
              userId,
              currentWeights: result.updatedWeights,
              weightHistory: existing?.weightHistory ?? [],
              totalFeedback: (existing?.totalFeedback ?? 0) + feedback.length,
              learningConfidence: result.confidence,
              lastUpdated: new Date().toISOString(),
            });
            this.logger.debug(`[FeedbackLearning] 用户权重已持久化 userId=${userId}`);
          } catch (pe: unknown) {
            this.logger.warn(`[FeedbackLearning] saveUserProfile 失败: ${(pe as Error)?.message}`);
          }
        }
      } catch (e: unknown) {
        errors.push(`${userId}: ${(e as Error)?.message}`);
      }
    }

    // Block 重要性学习：从 outcomeCapture.usedBlockKeys 更新 ContextLearningService
    await this.runBlockImportanceLearning(signals);

    return { usersProcessed, totalSamples, errors };
  }

  private outcomeCaptureToFeedbackRecord(
    oc: Record<string, unknown>,
    userId: string,
    tripRunId: string,
    id: string,
  ): FeedbackRecord {
    const planAbandoned = oc.planAbandoned as boolean | undefined;
    const type = planAbandoned ? 'EARLY_TERMINATION' : 'TRIP_COMPLETION';
    const satisfaction = oc.satisfaction as number | undefined;
    const fatigueLevel = oc.fatigueLevel as number | undefined;
    return {
      id,
      userId,
      tripId: tripRunId,
      type,
      timestamp: new Date().toISOString(),
      data: {
        overallSatisfaction: satisfaction,
        actualFatigueLevel: fatigueLevel,
        completionRate: planAbandoned ? 0 : 1,
      },
      weightsAtTime: DEFAULT_OBJECTIVE_WEIGHTS,
      utilityAtTime: 0.5,
    };
  }

  /**
   * Block 重要性学习：从 outcomeCapture 的 usedBlockKeys + satisfaction 更新 ContextLearningService
   */
  private async runBlockImportanceLearning(
    signals: Array<{ user_id: string | null; trip_run_id: string; context: unknown }>,
  ): Promise<void> {
    if (!this.contextLearning) return;
    for (const row of signals) {
      const userId = row.user_id ?? 'anonymous';
      const ctx = row.context as Record<string, unknown>;
      const oc = ctx?.outcomeCapture as Record<string, unknown> | undefined;
      if (!oc) continue;
      const usedKeys = Array.isArray(oc.usedBlockKeys) ? oc.usedBlockKeys : [];
      if (!usedKeys.length) continue;
      const satisfaction = (oc.satisfaction as number) ?? 0.5;
      const planAbandoned = oc.planAbandoned as boolean | undefined;
      const accepted = !planAbandoned;
      const blocks: ContextBlock[] = usedKeys.map((key: string) => {
        const typeStr = key.split('_').slice(0, -1).join('_') || key;
        return {
          key,
          type: typeStr as BlockType,
          text: '',
          priority: 50,
          visibility: 'public' as const,
          provenance: { source: 'computed' as const, identifier: 'outcome', timestamp: new Date().toISOString() },
        };
      });
      try {
        await this.contextLearning.learn({
          userId,
          tripId: row.trip_run_id,
          eventType: 'decision_made',
          eventData: {
            decisionResult: { accepted, satisfaction },
            contextPackage: {
              id: `outcome_${row.trip_run_id}`,
              phase: 'unknown',
              agent: 'unknown',
              userQuery: '',
              blocks,
              totalTokens: 0,
              tokenBudget: 0,
              compressed: false,
              createdAt: new Date().toISOString(),
            },
          },
        });
      } catch (e: unknown) {
        this.logger.debug(`[FeedbackLearning] Block 学习跳过: ${(e as Error)?.message}`);
      }
    }
  }

  /**
   * 手动触发学习（供管理接口调用）
   */
  async triggerLearningNow(): Promise<{ usersProcessed: number; totalSamples: number; errors: string[] }> {
    return this.runLearningFromRlhfOutcomes();
  }
}
