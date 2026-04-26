// src/agent/training/services/model-collapse-monitor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * ModelCollapseMonitorService
 * 
 * 职责：监控 Model Collapse 风险
 * 
 * Model Collapse 检测指标：
 * 1. 性能下降：validation score、reward 趋势下降
 * 2. 轨迹多样性：轨迹相似度、决策模式重复
 * 3. 分布变化：训练数据分布偏移
 */
@Injectable()
export class ModelCollapseMonitorService {
  private readonly logger = new Logger(ModelCollapseMonitorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 检测 Model Collapse 风险
   */
  async detectCollapseRisk(options: {
    modelVersion?: string;
    lookbackDays?: number;
    minTrajectories?: number;
  } = {}): Promise<CollapseRiskReport> {
    const {
      modelVersion,
      lookbackDays = 30,
      minTrajectories = 100,
    } = options;

    this.logger.log(
      `[ModelCollapseMonitor] 检测 Model Collapse 风险: modelVersion=${modelVersion}, lookbackDays=${lookbackDays}`,
    );

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - lookbackDays);

    // 构建查询条件
    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      validationStatus: 'VALIDATED',
    };

    if (modelVersion) {
      where.modelVersion = modelVersion;
    }

    // 获取轨迹数据
    const trajectories = await this.prisma.validatedTrajectory.findMany({
      where,
      select: {
        trajectoryId: true,
        validationScore: true,
        totalReward: true,
        modelVersion: true,
        createdAt: true,
        plan: true,
        decisionTrace: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (trajectories.length < minTrajectories) {
      this.logger.warn(
        `[ModelCollapseMonitor] 轨迹数量不足: ${trajectories.length} < ${minTrajectories}`,
      );
      return {
        riskLevel: 'LOW',
        riskScore: 0,
        indicators: {
          performanceTrend: 'INSUFFICIENT_DATA',
          diversityTrend: 'INSUFFICIENT_DATA',
          distributionShift: 'INSUFFICIENT_DATA',
        },
        metrics: {
          trajectoryCount: trajectories.length,
          avgScore: 0,
          avgReward: 0,
          diversityScore: 0,
        },
        recommendations: [
          '需要更多轨迹数据才能进行准确的 Model Collapse 检测',
        ],
        timestamp: new Date(),
      };
    }

    // 1. 性能趋势分析
    const performanceTrend = this.analyzePerformanceTrend(trajectories);

    // 2. 轨迹多样性分析
    const diversityScore = this.calculateDiversityScore(trajectories);
    const diversityTrend = this.analyzeDiversityTrend(trajectories);

    // 3. 分布变化检测
    const distributionShift = this.detectDistributionShift(trajectories);

    // 计算风险分数
    const riskScore = this.calculateRiskScore(
      performanceTrend,
      diversityTrend,
      distributionShift,
    );

    // 确定风险等级
    const riskLevel = this.determineRiskLevel(riskScore);

    // 生成建议
    const recommendations = this.generateRecommendations(
      riskLevel,
      performanceTrend,
      diversityTrend,
      distributionShift,
    );

    return {
      riskLevel,
      riskScore,
      indicators: {
        performanceTrend,
        diversityTrend,
        distributionShift,
      },
      metrics: {
        trajectoryCount: trajectories.length,
        avgScore: this.calculateAverage(
          trajectories.map((t) => t.validationScore),
        ),
        avgReward: this.calculateAverage(
          trajectories.map((t) => t.totalReward),
        ),
        diversityScore,
      },
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * 分析性能趋势
   */
  private analyzePerformanceTrend(
    trajectories: Array<{
      validationScore: number;
      totalReward: number;
      createdAt: Date;
    }>,
  ): 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA' {
    if (trajectories.length < 20) {
      return 'INSUFFICIENT_DATA';
    }

    // 将轨迹分为前半部分和后半部分
    const midPoint = Math.floor(trajectories.length / 2);
    const firstHalf = trajectories.slice(0, midPoint);
    const secondHalf = trajectories.slice(midPoint);

    const firstHalfAvgScore = this.calculateAverage(
      firstHalf.map((t) => t.validationScore),
    );
    const secondHalfAvgScore = this.calculateAverage(
      secondHalf.map((t) => t.validationScore),
    );

    const firstHalfAvgReward = this.calculateAverage(
      firstHalf.map((t) => t.totalReward),
    );
    const secondHalfAvgReward = this.calculateAverage(
      secondHalf.map((t) => t.totalReward),
    );

    const scoreChange = secondHalfAvgScore - firstHalfAvgScore;
    const rewardChange = secondHalfAvgReward - firstHalfAvgReward;

    // 如果 score 和 reward 都下降超过 5%，认为是下降趋势
    if (scoreChange < -0.05 && rewardChange < -0.1) {
      return 'DECLINING';
    }

    // 如果 score 和 reward 都提升超过 5%，认为是改善趋势
    if (scoreChange > 0.05 && rewardChange > 0.1) {
      return 'IMPROVING';
    }

    return 'STABLE';
  }

  /**
   * 计算轨迹多样性分数
   */
  private calculateDiversityScore(
    trajectories: Array<{
      plan: any;
      decisionTrace: any;
    }>,
  ): number {
    if (trajectories.length < 2) {
      return 1.0; // 单个轨迹认为多样性最高
    }

    // 简化的多样性计算：基于决策链的相似度
    const similarities: number[] = [];

    for (let i = 0; i < Math.min(trajectories.length, 100); i++) {
      for (let j = i + 1; j < Math.min(trajectories.length, 100); j++) {
        const similarity = this.calculateTrajectorySimilarity(
          trajectories[i],
          trajectories[j],
        );
        similarities.push(similarity);
      }
    }

    if (similarities.length === 0) {
      return 1.0;
    }

    const avgSimilarity =
      similarities.reduce((sum, s) => sum + s, 0) / similarities.length;

    // 多样性分数 = 1 - 平均相似度
    return Math.max(0, 1 - avgSimilarity);
  }

  /**
   * 计算两条轨迹的相似度（0-1）
   */
  private calculateTrajectorySimilarity(
    t1: { plan: any; decisionTrace: any },
    t2: { plan: any; decisionTrace: any },
  ): number {
    // 简化的相似度计算：基于决策链长度和步骤数量
    const trace1 = Array.isArray(t1.decisionTrace) ? t1.decisionTrace : [];
    const trace2 = Array.isArray(t2.decisionTrace) ? t2.decisionTrace : [];

    const len1 = trace1.length;
    const len2 = trace2.length;

    // 长度相似度
    const lengthSimilarity =
      1 - Math.abs(len1 - len2) / Math.max(len1, len2, 1);

    // 步骤相似度（如果步骤数量相同，相似度更高）
    const stepSimilarity = len1 === len2 ? 0.5 : 0;

    return (lengthSimilarity + stepSimilarity) / 2;
  }

  /**
   * 分析多样性趋势
   */
  private analyzeDiversityTrend(
    trajectories: Array<{
      plan: any;
      decisionTrace: any;
      createdAt: Date;
    }>,
  ): 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA' {
    if (trajectories.length < 20) {
      return 'INSUFFICIENT_DATA';
    }

    const midPoint = Math.floor(trajectories.length / 2);
    const firstHalf = trajectories.slice(0, midPoint);
    const secondHalf = trajectories.slice(midPoint);

    const firstHalfDiversity = this.calculateDiversityScore(firstHalf);
    const secondHalfDiversity = this.calculateDiversityScore(secondHalf);

    const diversityChange = secondHalfDiversity - firstHalfDiversity;

    if (diversityChange < -0.1) {
      return 'DECLINING';
    }

    if (diversityChange > 0.1) {
      return 'IMPROVING';
    }

    return 'STABLE';
  }

  /**
   * 检测分布变化
   */
  private detectDistributionShift(
    trajectories: Array<{
      validationScore: number;
      totalReward: number;
      createdAt: Date;
    }>,
  ): 'SHIFT_DETECTED' | 'STABLE' | 'INSUFFICIENT_DATA' {
    if (trajectories.length < 20) {
      return 'INSUFFICIENT_DATA';
    }

    const midPoint = Math.floor(trajectories.length / 2);
    const firstHalf = trajectories.slice(0, midPoint);
    const secondHalf = trajectories.slice(midPoint);

    // 计算分数分布的标准差
    const firstHalfScores = firstHalf.map((t) => t.validationScore);
    const secondHalfScores = secondHalf.map((t) => t.validationScore);

    const firstHalfStd = this.calculateStdDev(firstHalfScores);
    const secondHalfStd = this.calculateStdDev(secondHalfScores);

    // 如果标准差变化超过 20%，认为有分布变化
    const stdChange = Math.abs(secondHalfStd - firstHalfStd) / firstHalfStd;

    if (stdChange > 0.2) {
      return 'SHIFT_DETECTED';
    }

    return 'STABLE';
  }

  /**
   * 计算风险分数（0-1）
   */
  private calculateRiskScore(
    performanceTrend: string,
    diversityTrend: string,
    distributionShift: string,
  ): number {
    let riskScore = 0;

    // 性能下降贡献 40%
    if (performanceTrend === 'DECLINING') {
      riskScore += 0.4;
    }

    // 多样性下降贡献 30%
    if (diversityTrend === 'DECLINING') {
      riskScore += 0.3;
    }

    // 分布变化贡献 30%
    if (distributionShift === 'SHIFT_DETECTED') {
      riskScore += 0.3;
    }

    return Math.min(1, riskScore);
  }

  /**
   * 确定风险等级
   */
  private determineRiskLevel(riskScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (riskScore < 0.3) {
      return 'LOW';
    } else if (riskScore < 0.6) {
      return 'MEDIUM';
    } else {
      return 'HIGH';
    }
  }

  /**
   * 生成建议
   */
  private generateRecommendations(
    riskLevel: string,
    performanceTrend: string,
    diversityTrend: string,
    distributionShift: string,
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'HIGH') {
      recommendations.push('⚠️ Model Collapse 风险较高，建议暂停训练并检查数据质量');
    } else if (riskLevel === 'MEDIUM') {
      recommendations.push('⚠️ Model Collapse 风险中等，建议增加数据多样性');
    }

    if (performanceTrend === 'DECLINING') {
      recommendations.push('📉 检测到性能下降趋势，建议检查筛选标准和 reward 信号');
    }

    if (diversityTrend === 'DECLINING') {
      recommendations.push('🔄 检测到轨迹多样性下降，建议增加数据来源多样性');
    }

    if (distributionShift === 'SHIFT_DETECTED') {
      recommendations.push('📊 检测到数据分布变化，建议检查数据收集流程');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 当前未检测到 Model Collapse 风险');
    }

    return recommendations;
  }

  /**
   * 计算平均值
   */
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.calculateAverage(values);
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Model Collapse 风险报告
 */
export interface CollapseRiskReport {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskScore: number; // 0-1
  indicators: {
    performanceTrend: 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA';
    diversityTrend: 'DECLINING' | 'STABLE' | 'IMPROVING' | 'INSUFFICIENT_DATA';
    distributionShift: 'SHIFT_DETECTED' | 'STABLE' | 'INSUFFICIENT_DATA';
  };
  metrics: {
    trajectoryCount: number;
    avgScore: number;
    avgReward: number;
    diversityScore: number; // 0-1
  };
  recommendations: string[];
  timestamp: Date;
}
