// src/trips/decision/feedback/memory-updater.service.ts

/**
 * Memory Updater Service
 * 
 * 记忆更新机制服务
 * 根据用户反馈更新记忆和学习模型
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { DecisionRunLog } from '../decision-log';
import { ConstraintConflict } from '../constraints/constraint-dsl.types';
import { LearningService } from '../learning/learning.service';
import {
  PlanVariantFeedback,
  ConflictFeedback,
  DecisionQualityFeedback,
} from './feedback-collector.service';
import { QualityAssessmentResult } from './quality-assessor.service';

/**
 * 记忆更新结果
 */
export interface MemoryUpdateResult {
  /** 是否更新成功 */
  success: boolean;
  /** 更新的记忆类型 */
  updatedMemoryTypes: string[];
  /** 更新的参数 */
  updatedParameters: Record<string, any>;
  /** 更新原因 */
  reason: string;
  /** 更新时间 */
  updatedAt: Date;
}

@Injectable()
export class MemoryUpdaterService {
  private readonly logger = new Logger(MemoryUpdaterService.name);

  constructor(
    @Optional() @Inject(LearningService) private readonly learningService?: LearningService
  ) {}

  /**
   * 根据反馈更新记忆
   */
  async updateMemoryFromFeedback(
    log: DecisionRunLog,
    qualityAssessment: QualityAssessmentResult,
    feedbacks?: {
      planVariantFeedbacks?: PlanVariantFeedback[];
      conflictFeedbacks?: ConflictFeedback[];
      decisionQualityFeedback?: DecisionQualityFeedback;
    }
  ): Promise<MemoryUpdateResult> {
    this.logger.debug(
      `[记忆更新] 根据反馈更新记忆: runId=${log.runId}`
    );

    const updatedMemoryTypes: string[] = [];
    const updatedParameters: Record<string, any> = {};

      // 1. 如果质量评估为 POOR，触发学习更新
      if (qualityAssessment.qualityGrade === 'POOR') {
        this.logger.warn(
          `[记忆更新] 决策质量较差，触发学习更新: runId=${log.runId}`
        );

        // 使用 LearningService 学习（如果可用）
        if (this.learningService) {
          const learningResult = this.learningService.learnFromLogs(
            [log],
            feedbacks?.planVariantFeedbacks?.map(f => ({
              logId: log.runId,
              accepted: f.userChoice === 'selected',
              satisfaction: f.rating ? f.rating / 5 : undefined,
            }))
          );

          if (learningResult.policyAdjustments && Object.keys(learningResult.policyAdjustments).length > 0) {
            updatedMemoryTypes.push('policy_adjustments');
            updatedParameters.policyAdjustments = learningResult.policyAdjustments;
            this.logger.log(
              `[记忆更新] 策略调整: ${JSON.stringify(learningResult.policyAdjustments)}`
            );
          }
        } else {
          this.logger.warn(
            `[记忆更新] LearningService 不可用，跳过策略调整`
          );
        }
      }

    // 2. 如果冲突解释质量低，记录需要改进的地方
    if (qualityAssessment.metrics.conflictExplanationQualityScore < 0.6) {
      updatedMemoryTypes.push('conflict_explanation_improvement');
      updatedParameters.conflictExplanationIssues = feedbacks?.conflictFeedbacks
        ?.filter(f => !f.understood || !f.explanationClear)
        .map(f => ({
          conflictId: f.conflictId,
          conflictType: f.conflictType,
          issue: !f.understood ? 'not_understood' : 'explanation_unclear',
        }));
      this.logger.log(
        `[记忆更新] 记录冲突解释改进点: ${updatedParameters.conflictExplanationIssues?.length || 0}个`
      );
    }

    // 3. 如果权衡选项质量低，记录需要改进的地方
    if (qualityAssessment.metrics.tradeoffOptionsQualityScore < 0.6) {
      updatedMemoryTypes.push('tradeoff_options_improvement');
      updatedParameters.tradeoffOptionsIssues = feedbacks?.conflictFeedbacks
        ?.filter(f => !f.tradeoffOptionsUseful)
        .map(f => ({
          conflictId: f.conflictId,
          conflictType: f.conflictType,
        }));
      this.logger.log(
        `[记忆更新] 记录权衡选项改进点: ${updatedParameters.tradeoffOptionsIssues?.length || 0}个`
      );
    }

    // 4. 如果用户满意度低，记录需要改进的地方
    if (qualityAssessment.metrics.userSatisfactionScore < 0.6) {
      updatedMemoryTypes.push('user_satisfaction_improvement');
      updatedParameters.userSatisfactionIssues = {
        overallSatisfaction: feedbacks?.decisionQualityFeedback?.overallSatisfaction,
        planQuality: feedbacks?.decisionQualityFeedback?.planQuality,
        additionalFeedback: feedbacks?.decisionQualityFeedback?.additionalFeedback,
      };
      this.logger.log(
        `[记忆更新] 记录用户满意度改进点: satisfaction=${updatedParameters.userSatisfactionIssues.overallSatisfaction}`
      );
    }

    // 5. 如果用户选择了某个变体，记录成功案例
    if (feedbacks?.planVariantFeedbacks) {
      const selectedVariants = feedbacks.planVariantFeedbacks.filter(
        f => f.userChoice === 'selected'
      );
      if (selectedVariants.length > 0) {
        updatedMemoryTypes.push('successful_variants');
        updatedParameters.successfulVariants = selectedVariants.map(f => ({
          variantId: f.variantId,
          variantStrategy: f.variantStrategy,
          rating: f.rating,
        }));
        this.logger.log(
          `[记忆更新] 记录成功变体: ${selectedVariants.length}个`
        );
      }
    }

    // 6. 如果用户选择了某个权衡选项，记录成功案例
    if (feedbacks?.conflictFeedbacks) {
      const selectedTradeoffs = feedbacks.conflictFeedbacks.filter(
        f => f.selectedTradeoffOption
      );
      if (selectedTradeoffs.length > 0) {
        updatedMemoryTypes.push('successful_tradeoffs');
        updatedParameters.successfulTradeoffs = selectedTradeoffs.map(f => ({
          conflictId: f.conflictId,
          conflictType: f.conflictType,
          selectedOption: f.selectedTradeoffOption,
        }));
        this.logger.log(
          `[记忆更新] 记录成功权衡选项: ${selectedTradeoffs.length}个`
        );
      }
    }

    return {
      success: updatedMemoryTypes.length > 0,
      updatedMemoryTypes,
      updatedParameters,
      reason: `根据反馈更新记忆: ${updatedMemoryTypes.join(', ')}`,
      updatedAt: new Date(),
    };
  }

  /**
   * 批量更新记忆
   */
  async batchUpdateMemory(
    logs: DecisionRunLog[],
    qualityAssessments: QualityAssessmentResult[],
    feedbacksArray: Array<{
      planVariantFeedbacks?: PlanVariantFeedback[];
      conflictFeedbacks?: ConflictFeedback[];
      decisionQualityFeedback?: DecisionQualityFeedback;
    }>
  ): Promise<MemoryUpdateResult[]> {
    this.logger.debug(
      `[记忆更新] 批量更新记忆: ${logs.length}个决策`
    );

    const results: MemoryUpdateResult[] = [];

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const qualityAssessment = qualityAssessments[i];
      const feedbacks = feedbacksArray[i];

      try {
        const result = await this.updateMemoryFromFeedback(
          log,
          qualityAssessment,
          feedbacks
        );
        results.push(result);
      } catch (error) {
        this.logger.error(
          `[记忆更新] 更新记忆失败: runId=${log.runId}, ` +
          `error=${error instanceof Error ? error.message : String(error)}`
        );
        results.push({
          success: false,
          updatedMemoryTypes: [],
          updatedParameters: {},
          reason: `更新失败: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: new Date(),
        });
      }
    }

    this.logger.log(
      `[记忆更新] 批量更新完成: ${results.filter(r => r.success).length}/${results.length}成功`
    );

    return results;
  }
}
