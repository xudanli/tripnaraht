// src/trips/decision/services/calibration-scheduler.service.ts
/**
 * Calibration Scheduler Service（智能校准调度器）
 * 
 * Phase 2 核心服务：
 * - 自动检测何时需要校准
 * - 基于反馈积累触发校准
 * - 管理校准任务队列
 * 
 * @since 2026-02 Phase 2
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfidenceLevel } from '../models/human-capability.model';

/**
 * 校准触发条件
 */
export interface CalibrationTrigger {
  userId: string;
  reason: CalibrationReason;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  pendingFeedbackCount: number;
  lastCalibrationAt?: Date;
  daysSinceLastCalibration?: number;
}

/**
 * 校准原因
 */
export type CalibrationReason =
  | 'FEEDBACK_ACCUMULATED'      // 反馈积累（>=3条未处理反馈）
  | 'SIGNIFICANT_DEVIATION'     // 显著偏差（平均评分偏离2.0）
  | 'PERIODIC_REVIEW'           // 定期检查（30天以上未校准）
  | 'USER_REQUEST'              // 用户主动请求
  | 'CONFIDENCE_UPGRADE'        // 置信度升级条件满足
  | 'ANOMALY_DETECTED';         // 检测到异常

/**
 * 校准结果
 */
export interface CalibrationResult {
  userId: string;
  success: boolean;
  reason: CalibrationReason;
  oldModel: { maxDailyAscentM: number; rollingAscent3DaysM: number };
  newModel: { maxDailyAscentM: number; rollingAscent3DaysM: number };
  calibrationFactor: number;
  feedbacksProcessed: number;
  newConfidenceLevel: ConfidenceLevel;
  calibratedAt: Date;
}

/**
 * 校准统计
 */
export interface CalibrationStats {
  totalCalibrations: number;
  avgCalibrationFactor: number;
  usersCalibrated: number;
  lastRunAt: Date;
  nextScheduledAt: Date;
}

@Injectable()
export class CalibrationSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(CalibrationSchedulerService.name);
  private isRunning = false;
  private lastRunStats: CalibrationStats | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('CalibrationSchedulerService 初始化完成');
  }

  /**
   * 运行校准周期（可由定时任务或手动调用）
   */
  async runCalibrationCycle(): Promise<CalibrationResult[]> {
    if (this.isRunning) {
      this.logger.debug('校准任务正在运行中，跳过');
      return [];
    }

    this.isRunning = true;
    const results: CalibrationResult[] = [];

    try {
      const triggers = await this.detectCalibrationTriggers();
      this.logger.log(`发现 ${triggers.length} 个用户需要校准`);

      // 按优先级排序并处理
      const sorted = triggers.sort((a, b) => {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return order[a.priority] - order[b.priority];
      });

      for (const trigger of sorted.slice(0, 50)) {
        const result = await this.calibrateUser(trigger);
        if (result) results.push(result);
      }

      this.lastRunStats = {
        totalCalibrations: results.length,
        avgCalibrationFactor: results.length > 0
          ? results.reduce((s, r) => s + r.calibrationFactor, 0) / results.length
          : 1.0,
        usersCalibrated: results.length,
        lastRunAt: new Date(),
        nextScheduledAt: new Date(Date.now() + 3600000),
      };
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  /**
   * 检测需要校准的用户
   */
  async detectCalibrationTriggers(): Promise<CalibrationTrigger[]> {
    const triggers: CalibrationTrigger[] = [];

    try {
      // 查找有未处理反馈的用户
      const users = await this.prisma.$queryRaw<Array<{
        user_id: string;
        pending_count: bigint;
        avg_rating: number;
      }>>`
        SELECT user_id, COUNT(*) as pending_count, AVG(actual_effort_rating)::numeric as avg_rating
        FROM trip_fitness_feedback
        WHERE processed = false
        GROUP BY user_id
        HAVING COUNT(*) >= 2
      `;

      for (const u of users) {
        const count = Number(u.pending_count);
        const avg = Number(u.avg_rating);
        const deviation = Math.abs(avg - 2.0);

        triggers.push({
          userId: u.user_id,
          reason: deviation >= 0.5 ? 'SIGNIFICANT_DEVIATION' : 'FEEDBACK_ACCUMULATED',
          priority: deviation >= 0.5 || count >= 5 ? 'HIGH' : count >= 3 ? 'MEDIUM' : 'LOW',
          pendingFeedbackCount: count,
        });
      }
    } catch (e: any) {
      this.logger.error(`检测触发器失败: ${e.message}`);
    }

    return triggers;
  }

  /**
   * 校准单个用户
   */
  async calibrateUser(trigger: CalibrationTrigger): Promise<CalibrationResult | null> {
    const { userId, reason } = trigger;

    try {
      // 获取未处理反馈
      const feedbacks = await this.prisma.$queryRaw<Array<{
        actual_effort_rating: number;
        completed_as_planned: boolean;
      }>>`
        SELECT actual_effort_rating, completed_as_planned
        FROM trip_fitness_feedback
        WHERE user_id = ${userId} AND processed = false
        LIMIT 10
      `;

      if (feedbacks.length === 0) return null;

      // 计算校准因子
      const factor = this.calculateCalibrationFactor(feedbacks);

      // 获取当前参数
      const current = await this.getCurrentParams(userId);
      if (!current) return null;

      // 应用校准
      const newAscent = Math.round(current.maxDailyAscentM * factor);
      const newRolling = Math.round(current.rollingAscent3DaysM * factor);
      const totalFeedbacks = await this.getTotalFeedbacks(userId);
      const confidence = totalFeedbacks >= 5 ? 'HIGH' : totalFeedbacks >= 2 ? 'MEDIUM' : 'LOW';

      // 保存校准历史
      await this.prisma.$executeRaw`
        INSERT INTO fitness_calibration_history (
          user_id, old_max_daily_ascent_m, new_max_daily_ascent_m,
          old_rolling_ascent_3days_m, new_rolling_ascent_3days_m,
          calibration_factor, calibration_source, feedback_count, confidence_level
        ) VALUES (
          ${userId}, ${current.maxDailyAscentM}, ${newAscent},
          ${current.rollingAscent3DaysM}, ${newRolling},
          ${factor}, 'HISTORICAL', ${feedbacks.length}, ${confidence}
        )
      `;

      // 保存快照
      await this.prisma.$executeRaw`
        INSERT INTO user_fitness_profile_snapshot (
          user_id, max_daily_ascent_m, rolling_ascent_3days_m, max_slope_pct,
          confidence_level, assessment_source, completed_trip_count
        ) VALUES (
          ${userId}, ${newAscent}, ${newRolling}, ${current.maxSlopePct},
          ${confidence}, 'HISTORICAL', ${totalFeedbacks}
        )
      `;

      // 标记反馈已处理
      await this.prisma.$executeRaw`
        UPDATE trip_fitness_feedback SET processed = true, processed_at = NOW()
        WHERE user_id = ${userId} AND processed = false
      `;

      this.logger.log(`用户 ${userId} 校准完成: ${current.maxDailyAscentM}m → ${newAscent}m`);

      return {
        userId,
        success: true,
        reason,
        oldModel: { maxDailyAscentM: current.maxDailyAscentM, rollingAscent3DaysM: current.rollingAscent3DaysM },
        newModel: { maxDailyAscentM: newAscent, rollingAscent3DaysM: newRolling },
        calibrationFactor: factor,
        feedbacksProcessed: feedbacks.length,
        newConfidenceLevel: confidence as ConfidenceLevel,
        calibratedAt: new Date(),
      };
    } catch (e: any) {
      this.logger.error(`校准用户 ${userId} 失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 高级校准因子计算
   */
  private calculateCalibrationFactor(feedbacks: Array<{ actual_effort_rating: number; completed_as_planned: boolean }>): number {
    const avgRating = feedbacks.reduce((s, f) => s + f.actual_effort_rating, 0) / feedbacks.length;
    const ratingBias = (avgRating - 2) * 0.10; // 1→-0.10, 2→0, 3→+0.10

    const completionRate = feedbacks.filter(f => f.completed_as_planned).length / feedbacks.length;
    const completionPenalty = completionRate < 0.8 ? (0.8 - completionRate) * 0.2 : 0;

    const factor = 1.0 + ratingBias - completionPenalty;
    return Math.max(0.80, Math.min(1.20, factor)); // 限制 ±20%
  }

  private async getCurrentParams(userId: string) {
    const r = await this.prisma.$queryRaw<Array<{ max_daily_ascent_m: number; rolling_ascent_3days_m: number; max_slope_pct: number }>>`
      SELECT max_daily_ascent_m, rolling_ascent_3days_m, max_slope_pct
      FROM user_fitness_profile_snapshot WHERE user_id = ${userId}
      ORDER BY snapshot_at DESC LIMIT 1
    `;
    if (r.length > 0) return { maxDailyAscentM: r[0].max_daily_ascent_m, rollingAscent3DaysM: r[0].rolling_ascent_3days_m, maxSlopePct: r[0].max_slope_pct };

    // 默认值
    return { maxDailyAscentM: 800, rollingAscent3DaysM: 2000, maxSlopePct: 25 };
  }

  private async getTotalFeedbacks(userId: string): Promise<number> {
    const r = await this.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) as count FROM trip_fitness_feedback WHERE user_id = ${userId}`;
    return Number(r[0]?.count || 0);
  }

  getCalibrationStats() { return this.lastRunStats; }

  async triggerManualCalibration(userId: string): Promise<CalibrationResult | null> {
    return this.calibrateUser({ userId, reason: 'USER_REQUEST', priority: 'HIGH', pendingFeedbackCount: 0 });
  }
}
