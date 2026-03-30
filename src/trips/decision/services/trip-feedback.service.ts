// src/trips/decision/services/trip-feedback.service.ts
/**
 * Trip Feedback Service（旅程反馈服务）
 * 
 * 目标：将用户旅程反馈映射到 HumanCapabilityModel 微调
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TripFeedback,
  HumanCapabilityAdjustment,
  FeedbackAnalysisResult,
} from '../interfaces/trip-feedback.interface';
import { HumanCapabilityModel } from '../models/human-capability.model';
import { DecisionLogEntry } from '../shared/decision-result.types';

@Injectable()
export class TripFeedbackService {
  private readonly logger = new Logger(TripFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 分析旅程反馈并生成 HumanCapabilityModel 微调建议
   */
  async analyzeFeedback(
    feedback: TripFeedback,
    decisionLogs: DecisionLogEntry[]
  ): Promise<FeedbackAnalysisResult> {
    this.logger.debug(`分析旅程反馈: ${feedback.tripId}`);

    const adjustments: HumanCapabilityAdjustment[] = [];

    // 1. 分析整体强度评价
    if (feedback.overallIntensity === 'TOO_TIRED') {
      // 检查是否有连续高疲劳指数
      const highFatigueDays = this.detectHighFatigueDays(decisionLogs);
      
      if (highFatigueDays.length >= 2) {
        adjustments.push({
          profileId: `user_${feedback.userId}`,
          adjustmentType: 'REDUCE_ASCENT',
          adjustmentPercentage: -15, // 降低 15%
          reason: `整体太累 + ${highFatigueDays.length} 天疲劳指数 > 1.2`,
          confidence: 0.8,
        });
      } else {
        adjustments.push({
          profileId: `user_${feedback.userId}`,
          adjustmentType: 'REDUCE_PACE',
          adjustmentPercentage: -10, // 降低节奏 10%
          reason: '整体太累，但单日疲劳指数正常',
          confidence: 0.6,
        });
      }
    } else if (feedback.overallIntensity === 'TOO_LIGHT') {
      // 如果太轻，且没有负面体验，适度提升
      if (!feedback.additionalFeedback?.issues || feedback.additionalFeedback.issues.length === 0) {
        adjustments.push({
          profileId: `user_${feedback.userId}`,
          adjustmentType: 'INCREASE_ASCENT',
          adjustmentPercentage: 10, // 提高 10%
          reason: '整体太轻，且无负面体验',
          confidence: 0.7,
        });
      }
    }

    // 2. 分析高海拔不适
    if (feedback.altitudeDiscomfort === 'SEVERE') {
      adjustments.push({
        profileId: `user_${feedback.userId}`,
        adjustmentType: 'ADJUST_ALTITUDE',
        adjustmentPercentage: -20, // 降低最大海拔 20%
        reason: '高海拔不适严重',
        confidence: 0.9,
      });
    } else if (feedback.altitudeDiscomfort === 'MILD') {
      adjustments.push({
        profileId: `user_${feedback.userId}`,
        adjustmentType: 'ADJUST_ALTITUDE',
        adjustmentPercentage: -10, // 降低最大海拔 10%
        reason: '高海拔轻微不适',
        confidence: 0.7,
      });
    }

    // 3. 分析最累/最闲的天
    if (feedback.mostTiredDay) {
      // 检查该天的决策日志
      const dayLogs = decisionLogs.filter(_log => {
        // TODO: 从日志中提取 dayIndex
        return true; // 简化处理
      });

      if (dayLogs.length > 0) {
        adjustments.push({
          profileId: `user_${feedback.userId}`,
          adjustmentType: 'REDUCE_ASCENT',
          adjustmentPercentage: -5, // 针对该天降低 5%
          reason: `第 ${feedback.mostTiredDay} 天最累`,
          confidence: 0.6,
        });
      }
    }

    // 4. 生成摘要
    const summary = this.generateSummary(feedback, adjustments);

    return {
      needsAdjustment: adjustments.length > 0,
      adjustments,
      summary,
    };
  }

  /**
   * 应用调整到 HumanCapabilityModel
   */
  async applyAdjustments(
    profileId: string,
    adjustments: HumanCapabilityAdjustment[]
  ): Promise<HumanCapabilityModel> {
    this.logger.debug(`应用调整到 HumanCapabilityModel: ${profileId}`);

    // TODO: 从数据库加载当前 HumanCapabilityModel
    // 目前先返回模拟数据
    const currentModel: HumanCapabilityModel = {
      profileId,
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      preferredPace: 'MEDIUM',
      riskTolerance: 'MEDIUM',
      highAltitudeExperience: 'NONE',
    };

    // 应用调整
    for (const adjustment of adjustments) {
      switch (adjustment.adjustmentType) {
        case 'REDUCE_ASCENT':
          currentModel.maxDailyAscentM *= (1 + adjustment.adjustmentPercentage / 100);
          currentModel.rollingAscent3DaysM *= (1 + adjustment.adjustmentPercentage / 100);
          break;
        case 'INCREASE_ASCENT':
          currentModel.maxDailyAscentM *= (1 + adjustment.adjustmentPercentage / 100);
          currentModel.rollingAscent3DaysM *= (1 + adjustment.adjustmentPercentage / 100);
          break;
        case 'REDUCE_PACE':
          if (currentModel.preferredPace === 'FAST') {
            currentModel.preferredPace = 'MEDIUM';
          } else if (currentModel.preferredPace === 'MEDIUM') {
            currentModel.preferredPace = 'SLOW';
          }
          break;
        case 'INCREASE_PACE':
          if (currentModel.preferredPace === 'SLOW') {
            currentModel.preferredPace = 'MEDIUM';
          } else if (currentModel.preferredPace === 'MEDIUM') {
            currentModel.preferredPace = 'FAST';
          }
          break;
        case 'ADJUST_ALTITUDE':
          if (currentModel.maxElevationM) {
            currentModel.maxElevationM *= (1 + adjustment.adjustmentPercentage / 100);
          }
          break;
      }
    }

    // TODO: 保存到数据库

    return currentModel;
  }

  /**
   * 计算 REALITY_ALIGNMENT_SCORE
   * 
   * 简单版算法：
   * - 取一次 trip 中所有带 PHYSICAL / HUMAN 源的决策数量
   * - 所有决策数量
   * - 结合用户"满意度 / 强度自评"，得到一个简单分数
   */
  calculateRealityAlignmentScore(
    decisionLogs: DecisionLogEntry[],
    feedback: TripFeedback
  ): number {
    const totalDecisions = decisionLogs.length;
    const realityBasedDecisions = decisionLogs.filter(
      log => log.decisionSource === 'PHYSICAL' || log.decisionSource === 'HUMAN'
    ).length;

    // 基础分数：现实驱动决策比例
    const baseScore = realityBasedDecisions / totalDecisions;

    // 用户满意度加权
    let satisfactionWeight = 1.0;
    if (feedback.overallIntensity === 'JUST_RIGHT') {
      satisfactionWeight = 1.2; // 如果强度刚好，加分
    } else if (feedback.overallIntensity === 'TOO_TIRED' || feedback.overallIntensity === 'TOO_LIGHT') {
      satisfactionWeight = 0.8; // 如果强度不合适，减分
    }

    // 最终分数（0-1）
    const finalScore = Math.min(1.0, baseScore * satisfactionWeight);

    return finalScore;
  }

  /**
   * 检测高疲劳天数
   */
  private detectHighFatigueDays(_decisionLogs: DecisionLogEntry[]): number[] {
    // TODO: 从决策日志中提取疲劳指数
    // 简化处理：返回空数组
    return [];
  }

  /**
   * 生成分析摘要
   */
  private generateSummary(
    feedback: TripFeedback,
    adjustments: HumanCapabilityAdjustment[]
  ): string {
    if (adjustments.length === 0) {
      return '反馈分析完成，无需调整 HumanCapabilityModel。';
    }

    const adjustmentTypes = adjustments.map(a => a.adjustmentType).join('、');
    return `反馈分析完成，建议进行以下调整：${adjustmentTypes}。共 ${adjustments.length} 项调整建议。`;
  }
}

