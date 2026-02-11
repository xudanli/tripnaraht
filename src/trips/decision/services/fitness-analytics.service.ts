// src/trips/decision/services/fitness-analytics.service.ts
/**
 * Fitness Analytics Service（体能数据分析服务）
 * 
 * Phase 2 核心服务：
 * - 趋势检测
 * - 异常检测
 * - 用户体能报告生成
 * 
 * @since 2026-02 Phase 2
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * 趋势类型
 */
export type TrendType = 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';

/**
 * 异常类型
 */
export type AnomalyType = 
  | 'SUDDEN_DECLINE'        // 突然下降
  | 'CONSISTENT_OVERLOAD'   // 持续超负荷
  | 'RATING_INCONSISTENCY'  // 评分不一致
  | 'UNUSUAL_PATTERN';      // 异常模式

/**
 * 趋势分析结果
 */
export interface TrendAnalysis {
  userId: string;
  trend: TrendType;
  confidence: number;          // 0-1，趋势置信度
  slope: number;               // 变化斜率
  periodDays: number;          // 分析周期（天）
  dataPoints: number;          // 数据点数量
  summary: string;
  summaryZh: string;
}

/**
 * 异常检测结果
 */
export interface AnomalyDetection {
  userId: string;
  hasAnomaly: boolean;
  anomalies: Array<{
    type: AnomalyType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    descriptionZh: string;
    detectedAt: Date;
    relatedTripIds?: string[];
  }>;
}

/**
 * 用户体能报告
 */
export interface FitnessReport {
  userId: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  
  // 基础统计
  summary: {
    totalTrips: number;
    avgFatigueIndex: number;
    avgEffortRating: number;
    completionRate: number;
  };
  
  // 趋势分析
  trend: TrendAnalysis;
  
  // 异常检测
  anomalies: AnomalyDetection;
  
  // 能力变化
  capabilityChanges: {
    startMaxDailyAscentM: number;
    endMaxDailyAscentM: number;
    changePercent: number;
    calibrationCount: number;
  };
  
  // 建议
  recommendations: string[];
  recommendationsZh: string[];
}

/**
 * 时间序列数据点
 */
interface TimeSeriesPoint {
  date: Date;
  value: number;
}

@Injectable()
export class FitnessAnalyticsService {
  private readonly logger = new Logger(FitnessAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分析用户体能趋势
   */
  async analyzeTrend(userId: string, periodDays: number = 90): Promise<TrendAnalysis> {
    try {
      // 获取历史反馈数据
      const feedbacks = await this.prisma.$queryRaw<Array<{
        feedback_at: Date;
        actual_effort_rating: number;
        planned_fatigue_index: number;
      }>>`
        SELECT feedback_at, actual_effort_rating, planned_fatigue_index
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
          AND feedback_at > NOW() - INTERVAL '${periodDays} days'
        ORDER BY feedback_at ASC
      `;

      if (feedbacks.length < 3) {
        return {
          userId,
          trend: 'INSUFFICIENT_DATA',
          confidence: 0,
          slope: 0,
          periodDays,
          dataPoints: feedbacks.length,
          summary: 'Not enough data to determine trend',
          summaryZh: '数据不足，无法判断趋势',
        };
      }

      // 转换为时间序列
      const timeSeries: TimeSeriesPoint[] = feedbacks.map(f => ({
        date: f.feedback_at,
        value: f.actual_effort_rating,
      }));

      // 线性回归计算趋势
      const { slope, confidence } = this.linearRegression(timeSeries);

      // 判断趋势类型
      let trend: TrendType;
      let summary: string;
      let summaryZh: string;

      if (Math.abs(slope) < 0.01) {
        trend = 'STABLE';
        summary = 'Your fitness level is stable';
        summaryZh = '您的体能水平保持稳定';
      } else if (slope > 0.01) {
        trend = 'IMPROVING';
        summary = 'Your fitness is improving! Recent trips feel easier';
        summaryZh = '您的体能正在提升！最近的行程感觉更轻松';
      } else {
        trend = 'DECLINING';
        summary = 'Recent trips have been more challenging. Consider adjusting intensity';
        summaryZh = '最近的行程感觉更吃力，建议适当调整强度';
      }

      return {
        userId,
        trend,
        confidence,
        slope,
        periodDays,
        dataPoints: feedbacks.length,
        summary,
        summaryZh,
      };
    } catch (error: any) {
      this.logger.error(`趋势分析失败: ${error.message}`);
      return {
        userId,
        trend: 'INSUFFICIENT_DATA',
        confidence: 0,
        slope: 0,
        periodDays,
        dataPoints: 0,
        summary: 'Analysis failed',
        summaryZh: '分析失败',
      };
    }
  }

  /**
   * 检测异常
   */
  async detectAnomalies(userId: string): Promise<AnomalyDetection> {
    const anomalies: AnomalyDetection['anomalies'] = [];

    try {
      // 1. 检测突然下降：最近3次评分都是1（太累了）
      const recentFeedbacks = await this.prisma.$queryRaw<Array<{
        trip_id: string;
        actual_effort_rating: number;
        feedback_at: Date;
      }>>`
        SELECT trip_id, actual_effort_rating, feedback_at
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
        ORDER BY feedback_at DESC
        LIMIT 5
      `;

      if (recentFeedbacks.length >= 3) {
        const recent3 = recentFeedbacks.slice(0, 3);
        const allTooHard = recent3.every(f => f.actual_effort_rating === 1);
        
        if (allTooHard) {
          anomalies.push({
            type: 'SUDDEN_DECLINE',
            severity: 'HIGH',
            description: 'Last 3 trips were all rated as too hard',
            descriptionZh: '最近3次行程都感觉太累了',
            detectedAt: new Date(),
            relatedTripIds: recent3.map(f => f.trip_id),
          });
        }
      }

      // 2. 检测持续超负荷：平均疲劳指数持续 > 1.2
      const avgFatigue = await this.prisma.$queryRaw<Array<{ avg_fatigue: number }>>`
        SELECT AVG(planned_fatigue_index)::numeric as avg_fatigue
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
          AND feedback_at > NOW() - INTERVAL '30 days'
      `;

      if (avgFatigue[0]?.avg_fatigue > 1.2) {
        anomalies.push({
          type: 'CONSISTENT_OVERLOAD',
          severity: 'MEDIUM',
          description: 'Average fatigue index is consistently high',
          descriptionZh: '平均疲劳指数持续偏高',
          detectedAt: new Date(),
        });
      }

      // 3. 检测评分不一致：同等疲劳指数下评分差异大
      const inconsistency = await this.checkRatingInconsistency(userId);
      if (inconsistency) {
        anomalies.push(inconsistency);
      }

    } catch (error: any) {
      this.logger.error(`异常检测失败: ${error.message}`);
    }

    return {
      userId,
      hasAnomaly: anomalies.length > 0,
      anomalies,
    };
  }

  /**
   * 生成用户体能报告
   */
  async generateReport(userId: string, periodDays: number = 30): Promise<FitnessReport> {
    const endDate = new Date();
    const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // 基础统计
    const stats = await this.prisma.$queryRaw<Array<{
      total_trips: bigint;
      avg_fatigue: number;
      avg_rating: number;
      completion_rate: number;
    }>>`
      SELECT 
        COUNT(*) as total_trips,
        AVG(planned_fatigue_index)::numeric as avg_fatigue,
        AVG(actual_effort_rating)::numeric as avg_rating,
        AVG(CASE WHEN completed_as_planned THEN 1.0 ELSE 0.0 END)::numeric as completion_rate
      FROM trip_fitness_feedback
      WHERE user_id = ${userId}
        AND feedback_at BETWEEN ${startDate} AND ${endDate}
    `;

    // 能力变化
    const calibrations = await this.prisma.$queryRaw<Array<{
      old_ascent: number;
      new_ascent: number;
      calibrated_at: Date;
    }>>`
      SELECT old_max_daily_ascent_m as old_ascent, new_max_daily_ascent_m as new_ascent, calibrated_at
      FROM fitness_calibration_history
      WHERE user_id = ${userId}
        AND calibrated_at BETWEEN ${startDate} AND ${endDate}
      ORDER BY calibrated_at ASC
    `;

    let startAscent = 800, endAscent = 800;
    if (calibrations.length > 0) {
      startAscent = calibrations[0].old_ascent;
      endAscent = calibrations[calibrations.length - 1].new_ascent;
    }

    // 趋势和异常
    const trend = await this.analyzeTrend(userId, periodDays);
    const anomalies = await this.detectAnomalies(userId);

    // 生成建议
    const { recommendations, recommendationsZh } = this.generateRecommendations(
      trend,
      anomalies,
      Number(stats[0]?.avg_rating || 2),
      Number(stats[0]?.completion_rate || 1)
    );

    return {
      userId,
      generatedAt: new Date(),
      period: { start: startDate, end: endDate },
      summary: {
        totalTrips: Number(stats[0]?.total_trips || 0),
        avgFatigueIndex: Number(stats[0]?.avg_fatigue || 0),
        avgEffortRating: Number(stats[0]?.avg_rating || 0),
        completionRate: Number(stats[0]?.completion_rate || 0),
      },
      trend,
      anomalies,
      capabilityChanges: {
        startMaxDailyAscentM: startAscent,
        endMaxDailyAscentM: endAscent,
        changePercent: ((endAscent - startAscent) / startAscent) * 100,
        calibrationCount: calibrations.length,
      },
      recommendations,
      recommendationsZh,
    };
  }

  /**
   * 获取用户体能时间线
   */
  async getFitnessTimeline(userId: string, limit: number = 20): Promise<Array<{
    date: Date;
    event: 'TRIP_FEEDBACK' | 'CALIBRATION' | 'QUESTIONNAIRE';
    details: Record<string, any>;
  }>> {
    const timeline: Array<{
      date: Date;
      event: 'TRIP_FEEDBACK' | 'CALIBRATION' | 'QUESTIONNAIRE';
      details: Record<string, any>;
    }> = [];

    // 反馈事件
    const feedbacks = await this.prisma.$queryRaw<Array<{
      feedback_at: Date;
      trip_id: string;
      actual_effort_rating: number;
    }>>`
      SELECT feedback_at, trip_id, actual_effort_rating
      FROM trip_fitness_feedback
      WHERE user_id = ${userId}
      ORDER BY feedback_at DESC
      LIMIT ${limit}
    `;

    for (const f of feedbacks) {
      timeline.push({
        date: f.feedback_at,
        event: 'TRIP_FEEDBACK',
        details: { tripId: f.trip_id, rating: f.actual_effort_rating },
      });
    }

    // 校准事件
    const calibrations = await this.prisma.$queryRaw<Array<{
      calibrated_at: Date;
      calibration_factor: number;
      new_max_daily_ascent_m: number;
    }>>`
      SELECT calibrated_at, calibration_factor, new_max_daily_ascent_m
      FROM fitness_calibration_history
      WHERE user_id = ${userId}
      ORDER BY calibrated_at DESC
      LIMIT ${limit}
    `;

    for (const c of calibrations) {
      timeline.push({
        date: c.calibrated_at,
        event: 'CALIBRATION',
        details: { factor: c.calibration_factor, newAscent: c.new_max_daily_ascent_m },
      });
    }

    // 按时间排序
    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit);
  }

  // ========== 私有方法 ==========

  /**
   * 简单线性回归
   */
  private linearRegression(data: TimeSeriesPoint[]): { slope: number; confidence: number } {
    const n = data.length;
    if (n < 2) return { slope: 0, confidence: 0 };

    // 转换日期为数值（天数）
    const startTime = data[0].date.getTime();
    const points = data.map(d => ({
      x: (d.date.getTime() - startTime) / (1000 * 60 * 60 * 24),
      y: d.value,
    }));

    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // R² 作为置信度
    const meanY = sumY / n;
    const ssTotal = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
    const intercept = (sumY - slope * sumX) / n;
    const ssResidual = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return { slope, confidence: Math.max(0, r2) };
  }

  /**
   * 检测评分不一致
   */
  private async checkRatingInconsistency(userId: string): Promise<AnomalyDetection['anomalies'][0] | null> {
    try {
      // 查找相似疲劳指数但评分差异大的情况
      const variance = await this.prisma.$queryRaw<Array<{ rating_variance: number }>>`
        SELECT VARIANCE(actual_effort_rating)::numeric as rating_variance
        FROM trip_fitness_feedback
        WHERE user_id = ${userId}
          AND planned_fatigue_index BETWEEN 0.9 AND 1.1
      `;

      if (variance[0]?.rating_variance > 0.5) {
        return {
          type: 'RATING_INCONSISTENCY',
          severity: 'LOW',
          description: 'Rating varies significantly for similar difficulty trips',
          descriptionZh: '相似难度的行程评分差异较大',
          detectedAt: new Date(),
        };
      }
    } catch {
      // 忽略错误
    }
    return null;
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    trend: TrendAnalysis,
    anomalies: AnomalyDetection,
    avgRating: number,
    completionRate: number
  ): { recommendations: string[]; recommendationsZh: string[] } {
    const recommendations: string[] = [];
    const recommendationsZh: string[] = [];

    // 基于趋势
    if (trend.trend === 'DECLINING') {
      recommendations.push('Consider reducing trip intensity for the next few trips');
      recommendationsZh.push('建议接下来几次行程适当降低强度');
    } else if (trend.trend === 'IMPROVING') {
      recommendations.push('Great progress! You can try slightly more challenging routes');
      recommendationsZh.push('进步很大！可以尝试稍有挑战的路线');
    }

    // 基于异常
    for (const anomaly of anomalies.anomalies) {
      if (anomaly.type === 'SUDDEN_DECLINE') {
        recommendations.push('Take a rest day or choose an easier route');
        recommendationsZh.push('建议安排休息日或选择轻松路线');
      } else if (anomaly.type === 'CONSISTENT_OVERLOAD') {
        recommendations.push('Your trips have been consistently challenging. Consider adding buffer days');
        recommendationsZh.push('行程持续高负荷，建议增加缓冲日');
      }
    }

    // 基于完成率
    if (completionRate < 0.7) {
      recommendations.push('Many trips were not completed as planned. The system will adjust your fitness model');
      recommendationsZh.push('很多行程未能按计划完成，系统将调整您的体能模型');
    }

    // 如果没有特别建议
    if (recommendations.length === 0) {
      recommendations.push('Keep up the good work! Your fitness assessment is on track');
      recommendationsZh.push('继续保持！您的体能评估状态良好');
    }

    return { recommendations, recommendationsZh };
  }
}
