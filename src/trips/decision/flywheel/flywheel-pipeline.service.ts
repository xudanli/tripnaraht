/**
 * Phase 2 数据飞轮管道服务
 *
 * 编排 Decision → Outcome → Parameter Update → Better Decision 闭环。
 * 本阶段：离线训练 + 在线部署，每周/每月更新参数。
 */

import { Injectable, Logger } from '@nestjs/common';
import { FlywheelDecisionLogService } from './flywheel-decision-log.service';
import { FlywheelBehaviorLogService } from './flywheel-behavior-log.service';
import { FlywheelOutcomeService } from './flywheel-outcome.service';
import { FlywheelParameterService } from './flywheel-parameter.service';
import { WeightLearnerService, FeedbackRecord } from '../optimization/learning/weight-learner.service';
import { WeightPersistenceService } from '../optimization/learning/weight-persistence.service';
import { ObjectiveFunctionWeights, DEFAULT_OBJECTIVE_WEIGHTS } from '../optimization/objective-function.interface';
import { FlywheelDecisionLogInput, FlywheelBehaviorLogInput, FlywheelOutcomeInput, FlywheelBehaviorEventType } from './flywheel-types';

export interface FlywheelPipelineConfig {
  minTripsForLearning?: number;
  learningRate?: number;
}

@Injectable()
export class FlywheelPipelineService {
  private readonly logger = new Logger(FlywheelPipelineService.name);

  constructor(
    private readonly decisionLog: FlywheelDecisionLogService,
    private readonly behaviorLog: FlywheelBehaviorLogService,
    private readonly outcomeService: FlywheelOutcomeService,
    private readonly parameterService: FlywheelParameterService,
    private readonly weightLearner: WeightLearnerService,
    private readonly weightPersistence: WeightPersistenceService,
  ) {}

  /**
   * Layer 1: 记录决策
   */
  async recordDecision(input: FlywheelDecisionLogInput): Promise<string | null> {
    return this.decisionLog.logDecision(input);
  }

  /**
   * Layer 2: 记录用户行为
   */
  async recordBehavior(input: FlywheelBehaviorLogInput): Promise<string | null> {
    return this.behaviorLog.logBehavior(input);
  }

  /**
   * Layer 3: 记录行程结果
   */
  async recordOutcome(input: FlywheelOutcomeInput): Promise<string | null> {
    return this.outcomeService.upsertOutcome(input);
  }

  /**
   * 将 UserFeedbackLoop 的 ADOPT/EDIT/EXPORT/ABANDON 映射为 Behavior 事件
   */
  mapUserActionToBehaviorEvent(
    actionType: string,
  ): FlywheelBehaviorEventType | null {
    const map: Record<string, FlywheelBehaviorEventType> = {
      ADOPT: 'ADOPT',
      EDIT: 'PLAN_EDIT',
      EXPORT: 'EXPORT',
      ABANDON: 'ABANDON',
    };
    return map[actionType] ?? null;
  }

  /**
   * 运行离线学习管道（Raw Logs → Feature Extraction → Weight Update → Validation → Deploy）
   * 建议：每周/每月通过 cron 或管理接口触发
   */
  async runOfflineLearning(
    userId: string,
    config: FlywheelPipelineConfig = {},
  ): Promise<{
    success: boolean;
    samplesUsed: number;
    weightChanges?: Partial<ObjectiveFunctionWeights>;
    newVersion?: string;
    message: string;
  }> {
    const minTrips = config.minTripsForLearning ?? 50;

    try {
      const feedback = await this.loadFeedbackForUser(userId);
      if (feedback.length < 10) {
        return {
          success: false,
          samplesUsed: feedback.length,
          message: `样本不足，需要至少 10 条反馈，当前 ${feedback.length}。建议累计约 ${minTrips} 次旅行后再启动学习。`,
        };
      }

      const result = await this.weightLearner.learnFromFeedback(userId, feedback);

      if (result.samplesUsed < 10) {
        return {
          success: false,
          samplesUsed: result.samplesUsed,
          message: result.analysis.recommendations[0] ?? '样本不足',
        };
      }

      await this.weightPersistence.saveUserProfile(userId, {
        userId,
        currentWeights: result.updatedWeights,
        weightHistory: [],
        totalFeedback: feedback.length,
        learningConfidence: result.confidence,
        lastUpdated: new Date().toISOString(),
      });

      const version = `v2-${userId.slice(0, 8)}-${Date.now()}`;
      const paramSetId = await this.parameterService.createParameterSet({
        version,
        scope: 'personal',
        scopeId: userId,
        trainingDataRange: {
          start: feedback[feedback.length - 1]?.timestamp ?? new Date().toISOString(),
          end: feedback[0]?.timestamp ?? new Date().toISOString(),
        },
        metrics: {
          signalStrength: result.signalStrength,
          confidence: result.confidence,
          expectedImprovement: result.expectedImprovement,
        },
        weights: result.updatedWeights,
        isActive: false,
      });

      if (paramSetId) {
        await this.parameterService.activateParameterSet(paramSetId);
        await this.parameterService.bindUserToParameterSet(
          userId,
          paramSetId,
          version,
        );
      }

      this.logger.log(
        `[Flywheel] Offline learning completed for ${userId}: ${result.samplesUsed} samples, version=${version}`,
      );

      return {
        success: true,
        samplesUsed: result.samplesUsed,
        weightChanges: result.weightChanges,
        newVersion: version,
        message: `学习完成，主要变化: ${result.analysis.mainFactors.join('; ')}`,
      };
    } catch (error) {
      this.logger.error(
        `[Flywheel] Offline learning failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        success: false,
        samplesUsed: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 从四层飞轮数据构建 WeightLearner 所需的 FeedbackRecord
   */
  private async loadFeedbackForUser(userId: string): Promise<FeedbackRecord[]> {
    const outcomes = await this.outcomeService.getByUserId(userId, {
      since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      limit: 200,
    });

    const behaviors = await this.behaviorLog.getForLearning(userId, undefined, 200);
    await this.decisionLog.getByUserId(userId, {
      since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      limit: 200,
    });

    const feedback: FeedbackRecord[] = [];

    for (const o of outcomes) {
      const subj = (o.subjectiveFeedback ?? {}) as Record<string, number>;
      const fail = (o.failureSignals ?? {}) as Record<string, boolean | string[]>;

      feedback.push({
        id: o.id,
        userId,
        tripId: o.tripId,
        type: fail.planAbandoned || fail.earlyReturn ? 'EARLY_TERMINATION' : 'TRIP_COMPLETION',
        timestamp: o.createdAt.toISOString(),
        data: {
          overallSatisfaction: subj.satisfaction,
          actualFatigueLevel: subj.fatigueLevel,
          completionRate: fail.planAbandoned ? 0 : 1,
        },
        weightsAtTime: DEFAULT_OBJECTIVE_WEIGHTS,
        utilityAtTime: 0.5,
      });
    }

    for (const b of behaviors) {
      if (
        b.eventType === 'DAY_DELETE' ||
        b.eventType === 'DAY_SHORTEN' ||
        b.eventType === 'POI_REMOVE'
      ) {
        const modificationType =
          b.eventType === 'DAY_SHORTEN' ? 'INSERT_REST' : 'REMOVE_ACTIVITY';
        feedback.push({
          id: b.id,
          userId,
          tripId: b.tripId,
          type: 'PLAN_MODIFICATION',
          timestamp: b.createdAt.toISOString(),
          data: { modificationType },
          weightsAtTime: DEFAULT_OBJECTIVE_WEIGHTS,
          utilityAtTime: 0.5,
        });
      }
    }

    return feedback;
  }
}
