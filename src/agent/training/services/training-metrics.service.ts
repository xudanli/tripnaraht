// src/agent/training/services/training-metrics.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * TrainingMetricsService
 * 
 * 职责：监控轨迹收集和验证的指标
 */
@Injectable()
export class TrainingMetricsService {
  private readonly logger = new Logger(TrainingMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取轨迹收集统计
   */
  async getCollectionStats(options: {
    startDate?: Date;
    endDate?: Date;
    modelVersion?: string;
    countryCode?: string;
  } = {}): Promise<{
    totalTrajectories: number;
    validatedCount: number;
    rejectedCount: number;
    pendingCount: number;
    validationRate: number;
    avgValidationScore: number;
    avgReward: number;
    byModelVersion: Record<string, number>;
    byCountry: Record<string, number>;
  }> {
    const where: any = {};

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

    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      select: {
        validationStatus: true,
        validationScore: true,
        totalReward: true,
        modelVersion: true,
        countryCode: true,
      },
    });

    const totalTrajectories = trajectories.length;
    const validatedCount = trajectories.filter(
      (t) => t.validationStatus === 'VALIDATED',
    ).length;
    const rejectedCount = trajectories.filter(
      (t) => t.validationStatus === 'REJECTED',
    ).length;
    const pendingCount = trajectories.filter(
      (t) => t.validationStatus === 'PENDING',
    ).length;

    const validationRate =
      totalTrajectories > 0 ? validatedCount / totalTrajectories : 0;

    const scores = trajectories
      .map((t) => t.validationScore)
      .filter((s) => s !== null && s !== undefined);
    const avgValidationScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;

    const rewards = trajectories
      .map((t) => t.totalReward)
      .filter((r) => r !== null && r !== undefined);
    const avgReward =
      rewards.length > 0
        ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length
        : 0;

    // 按模型版本统计
    const byModelVersion: Record<string, number> = {};
    for (const t of trajectories) {
      const version = t.modelVersion || 'unknown';
      byModelVersion[version] = (byModelVersion[version] || 0) + 1;
    }

    // 按国家统计
    const byCountry: Record<string, number> = {};
    for (const t of trajectories) {
      const country = t.countryCode || 'unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;
    }

    return {
      totalTrajectories,
      validatedCount,
      rejectedCount,
      pendingCount,
      validationRate,
      avgValidationScore,
      avgReward,
      byModelVersion,
      byCountry,
    };
  }

  /**
   * 获取训练数据质量指标
   */
  async getTrainingDataQuality(options: {
    minScore?: number;
    minReward?: number;
  } = {}): Promise<{
    eligibleCount: number;
    avgScore: number;
    avgReward: number;
    scoreDistribution: {
      '0.8-0.9': number;
      '0.9-0.95': number;
      '0.95-1.0': number;
    };
    rewardDistribution: {
      '0-1': number;
      '1-2': number;
      '2+': number;
    };
  }> {
    const where: any = {
      validationStatus: 'VALIDATED',
    };

    if (options.minScore !== undefined) {
      where.validationScore = { gte: options.minScore };
    }

    if (options.minReward !== undefined) {
      where.totalReward = { gte: options.minReward };
    }

    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      select: {
        validationScore: true,
        totalReward: true,
      },
    });

    const eligibleCount = trajectories.length;

    const scores = trajectories.map((t) => t.validationScore);
    const avgScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;

    const rewards = trajectories.map((t) => t.totalReward);
    const avgReward =
      rewards.length > 0
        ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length
        : 0;

    // 分数分布
    const scoreDistribution = {
      '0.8-0.9': trajectories.filter(
        (t) => t.validationScore >= 0.8 && t.validationScore < 0.9,
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
      '0-1': trajectories.filter(
        (t) => t.totalReward >= 0 && t.totalReward < 1,
      ).length,
      '1-2': trajectories.filter(
        (t) => t.totalReward >= 1 && t.totalReward < 2,
      ).length,
      '2+': trajectories.filter((t) => t.totalReward >= 2).length,
    };

    return {
      eligibleCount,
      avgScore,
      avgReward,
      scoreDistribution,
      rewardDistribution,
    };
  }
}
