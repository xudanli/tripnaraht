// src/trips/decision/services/decision-logging.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DecisionPointType,
  DecisionOption,
  UserChoice,
  SystemAnalysis,
  ExpectedOutcome,
  ActualOutcome,
  Deviation,
  LearningSignals,
} from '../interfaces/decision-logging.interface';

/**
 * 决策日志服务
 * 
 * 负责记录决策点和决策结果，支持学习与改进
 */
@Injectable()
export class DecisionLoggingService {
  private readonly logger = new Logger(DecisionLoggingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 记录决策点
   */
  async logDecision(
    tripId: string,
    decisionPoint: DecisionPointType,
    options: DecisionOption[],
    userChoice: UserChoice,
    systemAnalysis: SystemAnalysis,
    context?: {
      countryCode?: string;
      routeDirectionId?: string;
      persona?: 'ABU' | 'DR_DRE' | 'NEPTUNE';
      decisionSource?: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
      decisionStage?: string;
      explanation?: string;
      reasonCodes?: string[];
      evidenceRefs?: string[];
    },
  ): Promise<{ id: string }> {
    try {
      // 计算系统建议与用户选择的一致性
      const alignmentScore = this.calculateAlignment(
        systemAnalysis.topRecommendation?.optionId,
        userChoice.optionId,
      );

      // 创建决策日志
      const decisionLog = await this.prisma.decisionLog.create({
        data: {
          tripId,
          countryCode: context?.countryCode,
          routeDirectionId: context?.routeDirectionId,
          persona: context?.persona || 'NEPTUNE',
          action: 'ALLOW', // 默认允许，实际应该根据决策结果设置
          decisionSource: context?.decisionSource || 'PHYSICAL',
          decisionStage: context?.decisionStage || 'FINALIZE',
          explanation: context?.explanation || `决策点：${decisionPoint}`,
          reasonCodes: context?.reasonCodes || [],
          evidenceRefs: context?.evidenceRefs || [],
          timestamp: new Date(),
          metadata: {
            decisionPointType: decisionPoint,
          },
          // 新增字段（序列化为JSON）
          availableOptions: options as any,
          userChoice: {
            selectedOptionId: userChoice.optionId,
            selectionTime: userChoice.selectionTime,
            userReasoning: userChoice.reasoning,
            confidenceLevel: userChoice.confidenceLevel,
          },
          confidenceLevel: userChoice.confidenceLevel,
          systemRecommendation: systemAnalysis.topRecommendation
            ? {
                optionId: systemAnalysis.topRecommendation.optionId,
                rationale: systemAnalysis.topRecommendation.rationale,
                recommendationRationale: systemAnalysis.recommendationRationale,
              }
            : null,
          alignmentScore,
        },
      });

      this.logger.log(
        `记录决策点：${decisionPoint}，用户选择：${userChoice.optionId}，一致性：${alignmentScore}`,
      );

      return { id: decisionLog.id };
    } catch (error) {
      this.logger.error(`记录决策点失败: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * 记录决策结果
   */
  async logOutcome(
    decisionId: string,
    expectedOutcome: ExpectedOutcome,
    actualOutcome: ActualOutcome,
    userSatisfaction?: number,
    userFeedback?: string,
  ): Promise<{ id: string }> {
    try {
      // 检查决策日志是否存在
      const decisionLog = await this.prisma.decisionLog.findUnique({
        where: { id: decisionId },
      });

      if (!decisionLog) {
        throw new Error(`决策日志 ${decisionId} 不存在`);
      }

      // 计算偏差
      const deviation = this.calculateDeviation(expectedOutcome, actualOutcome);

      // 生成学习信号
      const learningSignals = this.generateLearningSignals(
        expectedOutcome,
        actualOutcome,
        userSatisfaction,
      );

      // 创建决策结果
      const outcome = await this.prisma.decisionOutcome.create({
        data: {
          decisionId,
          expectedOutcome: expectedOutcome as any,
          actualOutcome: actualOutcome as any,
          deviation: deviation as any,
          userSatisfaction,
          userFeedback,
          learningSignals: learningSignals as any,
        },
      });

      this.logger.log(
        `记录决策结果：${decisionId}，用户满意度：${userSatisfaction || '未提供'}`,
      );

      return { id: outcome.id };
    } catch (error) {
      this.logger.error(`记录决策结果失败: ${error}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  /**
   * 计算系统建议与用户选择的一致性
   */
  private calculateAlignment(
    systemRecommendationOptionId: string | undefined,
    userChoiceOptionId: string,
  ): number {
    if (!systemRecommendationOptionId) {
      return 0.5; // 如果没有系统推荐，返回中等一致性
    }

    if (systemRecommendationOptionId === userChoiceOptionId) {
      return 1.0; // 完全一致
    }

    return 0.0; // 不一致
  }

  /**
   * 计算偏差
   */
  private calculateDeviation(
    expected: ExpectedOutcome,
    actual: ActualOutcome,
  ): Deviation {
    // 计算满意度偏差
    const satisfactionDiff =
      (actual.actualSatisfaction || 0) - (expected.expectedSatisfaction || 0);

    let type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    let magnitude: number;

    if (satisfactionDiff > 1) {
      type = 'POSITIVE';
      magnitude = Math.min(satisfactionDiff / 10, 1.0);
    } else if (satisfactionDiff < -1) {
      type = 'NEGATIVE';
      magnitude = Math.min(Math.abs(satisfactionDiff) / 10, 1.0);
    } else {
      type = 'NEUTRAL';
      magnitude = Math.abs(satisfactionDiff) / 10;
    }

    const description =
      type === 'POSITIVE'
        ? '实际体验超出预期'
        : type === 'NEGATIVE'
          ? '实际体验低于预期'
          : '实际体验与预期基本一致';

    return {
      type,
      description,
      magnitude,
      details: {
        satisfactionDiff,
        expectedSatisfaction: expected.expectedSatisfaction,
        actualSatisfaction: actual.actualSatisfaction,
      },
    };
  }

  /**
   * 生成学习信号
   */
  private generateLearningSignals(
    expected: ExpectedOutcome,
    actual: ActualOutcome,
    userSatisfaction?: number,
  ): LearningSignals {
    const signals: LearningSignals = {
      preferenceSignals: {},
      decisionPatternSignals: {},
      improvementSuggestions: [],
    };

    // 如果用户满意度高，记录偏好信号
    if (userSatisfaction && userSatisfaction >= 8) {
      signals.preferenceSignals = {
        highSatisfaction: true,
        satisfactionLevel: userSatisfaction,
      };
    }

    // 如果实际体验与预期有偏差，记录决策模式信号
    const satisfactionDiff =
      (actual.actualSatisfaction || 0) - (expected.expectedSatisfaction || 0);
    if (Math.abs(satisfactionDiff) > 2) {
      signals.decisionPatternSignals = {
        predictionAccuracy: 'LOW',
        deviationMagnitude: Math.abs(satisfactionDiff),
      };
      signals.improvementSuggestions?.push(
        '需要改进满意度预测模型，提高预测准确性',
      );
    }

    // 如果实际风险与预期不同，记录风险评估信号
    if (
      actual.actualRisks &&
      expected.expectedRisks &&
      actual.actualRisks.length !== expected.expectedRisks.length
    ) {
      signals.decisionPatternSignals = {
        ...signals.decisionPatternSignals,
        riskAssessmentAccuracy: 'NEEDS_IMPROVEMENT',
      };
      signals.improvementSuggestions?.push(
        '需要改进风险评估模型，更准确地识别潜在风险',
      );
    }

    return signals;
  }

  /**
   * 获取用户的个人决策学习
   */
  async getUserDecisionLearning(
    userId: string,
    tripId?: string,
  ): Promise<{
    decisionPatterns: Record<string, any>;
    preferenceSignals: Record<string, any>;
    improvementSuggestions: string[];
  }> {
    try {
      // 查询用户的决策日志
      const logs = await this.prisma.decisionLog.findMany({
        where: {
          tripId: tripId || undefined,
          // 注意：这里需要根据实际的数据模型调整查询条件
        },
        include: {
          outcomes: true,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100, // 限制查询数量
      });

      // 分析决策模式
      const decisionPatterns: Record<string, any> = {};
      const preferenceSignals: Record<string, any> = {};
      const improvementSuggestions: string[] = [];

      // 统计用户选择与系统推荐的一致性
      let alignmentCount = 0;
      let totalDecisions = 0;

      for (const log of logs) {
        if (log.alignmentScore !== null) {
          totalDecisions++;
          if (log.alignmentScore >= 0.8) {
            alignmentCount++;
          }
        }
      }

      if (totalDecisions > 0) {
        decisionPatterns.alignmentRate = alignmentCount / totalDecisions;
        if (decisionPatterns.alignmentRate < 0.5) {
          improvementSuggestions.push(
            '系统推荐与用户选择的一致性较低，建议改进推荐算法',
          );
        }
      }

      // 分析用户满意度趋势
      const satisfactions: number[] = [];
      for (const log of logs) {
        for (const outcome of log.outcomes) {
          if (outcome.userSatisfaction !== null) {
            satisfactions.push(outcome.userSatisfaction);
          }
        }
      }

      if (satisfactions.length > 0) {
        const avgSatisfaction =
          satisfactions.reduce((a, b) => a + b, 0) / satisfactions.length;
        preferenceSignals.averageSatisfaction = avgSatisfaction;

        if (avgSatisfaction < 7) {
          improvementSuggestions.push(
            '用户整体满意度较低，建议分析原因并改进服务',
          );
        }
      }

      return {
        decisionPatterns,
        preferenceSignals,
        improvementSuggestions,
      };
    } catch (error) {
      this.logger.error(
        `获取用户决策学习失败: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }
}
