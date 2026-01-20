// src/agent/training/services/training-quality-analyzer.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * TrainingQualityAnalyzerService
 * 
 * 职责：分析训练数据的分布和质量
 * 
 * 功能：
 * 1. 数据分布分析（score、reward、时间分布）
 * 2. 质量趋势分析（随时间变化）
 * 3. 异常检测（异常值、离群点）
 */
@Injectable()
export class TrainingQualityAnalyzerService {
  private readonly logger = new Logger(TrainingQualityAnalyzerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分析训练数据质量
   */
  async analyzeQuality(options: {
    startDate?: Date;
    endDate?: Date;
    modelVersion?: string;
    countryCode?: string;
    minScore?: number;
    minReward?: number;
  } = {}): Promise<QualityAnalysisReport> {
    this.logger.log(`[QualityAnalyzer] 分析训练数据质量`);

    const where: any = {
      validationStatus: 'VALIDATED',
    };

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    if (options.modelVersion) {
      where.modelVersion = options.modelVersion;
    }

    if (options.countryCode) {
      where.countryCode = options.countryCode;
    }

    if (options.minScore !== undefined) {
      where.validationScore = { gte: options.minScore };
    }

    if (options.minReward !== undefined) {
      where.totalReward = { gte: options.minReward };
    }

    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      select: {
        trajectoryId: true,
        validationScore: true,
        totalReward: true,
        modelVersion: true,
        countryCode: true,
        createdAt: true,
        usedForTrainingCount: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 1. 数据分布分析
    const distribution = this.analyzeDistribution(trajectories);

    // 2. 质量趋势分析
    const trends = this.analyzeTrends(trajectories);

    // 3. 异常检测
    const anomalies = this.detectAnomalies(trajectories);

    // 4. 统计摘要
    const summary = this.generateSummary(trajectories, distribution, trends);

    return {
      summary,
      distribution,
      trends,
      anomalies,
      timestamp: new Date(),
    };
  }

  /**
   * 分析数据分布
   */
  private analyzeDistribution(
    trajectories: Array<{
      validationScore: number;
      totalReward: number;
      modelVersion: string | null;
      countryCode: string | null;
      createdAt: Date;
    }>,
  ): DistributionAnalysis {
    const scores = trajectories.map((t) => t.validationScore);
    const rewards = trajectories.map((t) => t.totalReward);

    // Score 分布
    const scoreDistribution = {
      '0.8-0.85': trajectories.filter(
        (t) => t.validationScore >= 0.8 && t.validationScore < 0.85,
      ).length,
      '0.85-0.9': trajectories.filter(
        (t) => t.validationScore >= 0.85 && t.validationScore < 0.9,
      ).length,
      '0.9-0.95': trajectories.filter(
        (t) => t.validationScore >= 0.9 && t.validationScore < 0.95,
      ).length,
      '0.95-1.0': trajectories.filter(
        (t) => t.validationScore >= 0.95 && t.validationScore <= 1.0,
      ).length,
    };

    // Reward 分布
    const rewardDistribution = {
      '0-0.5': trajectories.filter(
        (t) => t.totalReward >= 0 && t.totalReward < 0.5,
      ).length,
      '0.5-1.0': trajectories.filter(
        (t) => t.totalReward >= 0.5 && t.totalReward < 1.0,
      ).length,
      '1.0-2.0': trajectories.filter(
        (t) => t.totalReward >= 1.0 && t.totalReward < 2.0,
      ).length,
      '2.0+': trajectories.filter((t) => t.totalReward >= 2.0).length,
    };

    // 按模型版本分布
    const byModelVersion: Record<string, number> = {};
    for (const t of trajectories) {
      const version = t.modelVersion || 'unknown';
      byModelVersion[version] = (byModelVersion[version] || 0) + 1;
    }

    // 按国家分布
    const byCountry: Record<string, number> = {};
    for (const t of trajectories) {
      const country = t.countryCode || 'unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;
    }

    // 时间分布（按周）
    const byWeek: Record<string, number> = {};
    for (const t of trajectories) {
      const week = this.getWeekKey(t.createdAt);
      byWeek[week] = (byWeek[week] || 0) + 1;
    }

    return {
      score: {
        mean: this.calculateMean(scores),
        median: this.calculateMedian(scores),
        stdDev: this.calculateStdDev(scores),
        min: Math.min(...scores),
        max: Math.max(...scores),
        distribution: scoreDistribution,
      },
      reward: {
        mean: this.calculateMean(rewards),
        median: this.calculateMedian(rewards),
        stdDev: this.calculateStdDev(rewards),
        min: Math.min(...rewards),
        max: Math.max(...rewards),
        distribution: rewardDistribution,
      },
      byModelVersion,
      byCountry,
      byWeek,
    };
  }

  /**
   * 分析质量趋势
   */
  private analyzeTrends(
    trajectories: Array<{
      validationScore: number;
      totalReward: number;
      createdAt: Date;
    }>,
  ): TrendAnalysis {
    if (trajectories.length < 10) {
      return {
        scoreTrend: 'INSUFFICIENT_DATA',
        rewardTrend: 'INSUFFICIENT_DATA',
        dataPoints: [],
      };
    }

    // 按时间分组（每周）
    const weeklyData: Record<
      string,
      { scores: number[]; rewards: number[] }
    > = {};

    for (const t of trajectories) {
      const week = this.getWeekKey(t.createdAt);
      if (!weeklyData[week]) {
        weeklyData[week] = { scores: [], rewards: [] };
      }
      weeklyData[week].scores.push(t.validationScore);
      weeklyData[week].rewards.push(t.totalReward);
    }

    // 计算每周平均值
    const dataPoints = Object.keys(weeklyData)
      .sort()
      .map((week) => ({
        week,
        avgScore: this.calculateMean(weeklyData[week].scores),
        avgReward: this.calculateMean(weeklyData[week].rewards),
        count: weeklyData[week].scores.length,
      }));

    // 分析趋势
    const scoreTrend = this.calculateTrend(
      dataPoints.map((d) => d.avgScore),
    );
    const rewardTrend = this.calculateTrend(
      dataPoints.map((d) => d.avgReward),
    );

    return {
      scoreTrend,
      rewardTrend,
      dataPoints,
    };
  }

  /**
   * 检测异常
   */
  private detectAnomalies(
    trajectories: Array<{
      trajectoryId: string;
      validationScore: number;
      totalReward: number;
      createdAt: Date;
    }>,
  ): AnomalyDetection {
    const scores = trajectories.map((t) => t.validationScore);
    const rewards = trajectories.map((t) => t.totalReward);

    const scoreMean = this.calculateMean(scores);
    const scoreStdDev = this.calculateStdDev(scores);
    const rewardMean = this.calculateMean(rewards);
    const rewardStdDev = this.calculateStdDev(rewards);

    // 使用 3-sigma 规则检测异常值
    const scoreThreshold = 3 * scoreStdDev;
    const rewardThreshold = 3 * rewardStdDev;

    const scoreOutliers: string[] = [];
    const rewardOutliers: string[] = [];

    for (const t of trajectories) {
      if (Math.abs(t.validationScore - scoreMean) > scoreThreshold) {
        scoreOutliers.push(t.trajectoryId);
      }
      if (Math.abs(t.totalReward - rewardMean) > rewardThreshold) {
        rewardOutliers.push(t.trajectoryId);
      }
    }

    return {
      scoreOutliers: {
        count: scoreOutliers.length,
        percentage: (scoreOutliers.length / trajectories.length) * 100,
        trajectoryIds: scoreOutliers.slice(0, 10), // 只返回前 10 个
      },
      rewardOutliers: {
        count: rewardOutliers.length,
        percentage: (rewardOutliers.length / trajectories.length) * 100,
        trajectoryIds: rewardOutliers.slice(0, 10),
      },
    };
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    trajectories: Array<any>,
    distribution: DistributionAnalysis,
    trends: TrendAnalysis,
  ): QualitySummary {
    const totalCount = trajectories.length;
    const highQualityCount = trajectories.filter(
      (t) => t.validationScore >= 0.9 && t.totalReward >= 1.0,
    ).length;

    return {
      totalTrajectories: totalCount,
      highQualityCount,
      highQualityPercentage: (highQualityCount / totalCount) * 100,
      avgScore: distribution.score.mean,
      avgReward: distribution.reward.mean,
      scoreTrend: trends.scoreTrend,
      rewardTrend: trends.rewardTrend,
      qualityGrade: this.calculateQualityGrade(
        distribution.score.mean,
        distribution.reward.mean,
        highQualityCount / totalCount,
      ),
    };
  }

  /**
   * 计算质量等级
   */
  private calculateQualityGrade(
    avgScore: number,
    avgReward: number,
    highQualityRatio: number,
  ): 'A' | 'B' | 'C' | 'D' {
    let grade = 0;

    if (avgScore >= 0.9) grade += 2;
    else if (avgScore >= 0.85) grade += 1;

    if (avgReward >= 1.5) grade += 2;
    else if (avgReward >= 1.0) grade += 1;

    if (highQualityRatio >= 0.5) grade += 2;
    else if (highQualityRatio >= 0.3) grade += 1;

    if (grade >= 5) return 'A';
    if (grade >= 3) return 'B';
    if (grade >= 1) return 'C';
    return 'D';
  }

  /**
   * 计算趋势
   */
  private calculateTrend(values: number[]): 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA' {
    if (values.length < 3) {
      return 'INSUFFICIENT_DATA';
    }

    // 使用线性回归计算趋势
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;

    const sumX = x.reduce((sum, v) => sum + v, 0);
    const sumY = y.reduce((sum, v) => sum + v, 0);
    const sumXY = x.reduce((sum, v, i) => sum + v * y[i], 0);
    const sumXX = x.reduce((sum, v) => sum + v * v, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    if (slope > 0.01) {
      return 'INCREASING';
    } else if (slope < -0.01) {
      return 'DECREASING';
    } else {
      return 'STABLE';
    }
  }

  /**
   * 获取周键（YYYY-WW 格式）
   */
  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const days = Math.floor(
      (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000),
    );
    const week = Math.floor(days / 7) + 1;
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  /**
   * 计算平均值
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 计算中位数
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = this.calculateMean(values);
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }
}

/**
 * 质量分析报告
 */
export interface QualityAnalysisReport {
  summary: QualitySummary;
  distribution: DistributionAnalysis;
  trends: TrendAnalysis;
  anomalies: AnomalyDetection;
  timestamp: Date;
}

/**
 * 质量摘要
 */
export interface QualitySummary {
  totalTrajectories: number;
  highQualityCount: number;
  highQualityPercentage: number;
  avgScore: number;
  avgReward: number;
  scoreTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  rewardTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  qualityGrade: 'A' | 'B' | 'C' | 'D';
}

/**
 * 分布分析
 */
export interface DistributionAnalysis {
  score: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    distribution: Record<string, number>;
  };
  reward: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    distribution: Record<string, number>;
  };
  byModelVersion: Record<string, number>;
  byCountry: Record<string, number>;
  byWeek: Record<string, number>;
}

/**
 * 趋势分析
 */
export interface TrendAnalysis {
  scoreTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  rewardTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA';
  dataPoints: Array<{
    week: string;
    avgScore: number;
    avgReward: number;
    count: number;
  }>;
}

/**
 * 异常检测
 */
export interface AnomalyDetection {
  scoreOutliers: {
    count: number;
    percentage: number;
    trajectoryIds: string[];
  };
  rewardOutliers: {
    count: number;
    percentage: number;
    trajectoryIds: string[];
  };
}
