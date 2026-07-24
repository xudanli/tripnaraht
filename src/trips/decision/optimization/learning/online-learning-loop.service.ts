/**
 * 在线学习循环服务
 *
 * 专利实现：决策闭环学习方程
 * θ_{k+1} = θ_k − η ∇_θ L
 * 
 * 形成：感知 → 决策 → 反馈 → 学习 → 优化 闭环
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import { WeightLearnerService, FeedbackRecord, FeedbackType } from './weight-learner.service';
import { WeightPersistenceService } from './weight-persistence.service';
import { RegretTrackerService } from '../theory/regret-tracker.service';
import { DifferentiableDecisionService } from '../differentiable/differentiable-decision.service';
import { DEFAULT_OBJECTIVE_WEIGHTS, ObjectiveFunctionWeights } from '../objective-function.interface';

export interface DecisionOutcome {
  decisionId: string;
  userId: string;
  tripId?: string;
  satisfactionScore?: number;
  actualUtility?: number;
  /** 决策时记录的期望效用（与 actualUtility 对照用于 regret 等） */
  predictedUtility?: number;
  explicitFeedback?: { type: 'LIKE' | 'DISLIKE' | 'NEUTRAL'; comment?: string };
  behavioralSignals?: {
    completed: boolean;
    modificationCount: number;
    dwellTimeSeconds?: number;
    shared?: boolean;
  };
  constraintViolations?: string[];
  timestamp: string;
  weightsAtFeedback?: ObjectiveFunctionWeights;
}

export interface LearningEvent {
  eventId: string;
  eventType: 'FEEDBACK_RECEIVED' | 'WEIGHTS_UPDATED' | 'MODEL_TRAINED' | 'REGRET_RECORDED';
  timestamp: string;
  userId: string;
  details: Record<string, unknown>;
}

export interface OnlineLearningConfig {
  enabled: boolean;
  learningRate: number;
  minFeedbackCount: number;
  batchSize: number;
  useDifferentiableModel: boolean;
  autoPersist: boolean;
  regretTracking: {
    enabled: boolean;
    optimalEstimationMethod: 'FIXED' | 'RUNNING_MAX' | 'EXPONENTIAL_SMOOTHING';
  };
}

const DEFAULT_CONFIG: OnlineLearningConfig = {
  enabled: true,
  learningRate: 0.01,
  minFeedbackCount: 5,
  batchSize: 10,
  useDifferentiableModel: false,
  autoPersist: true,
  regretTracking: {
    enabled: true,
    optimalEstimationMethod: 'RUNNING_MAX',
  },
};

function mergeOnlineLearningConfigFromEnv(base: OnlineLearningConfig): OnlineLearningConfig {
  const min = parseInt(process.env.ONLINE_LEARNING_MIN_FEEDBACK_COUNT ?? '', 10);
  const disabled =
    process.env.ONLINE_LEARNING_ENABLED === '0' || process.env.ONLINE_LEARNING_ENABLED === 'false';
  return {
    ...base,
    enabled: disabled ? false : base.enabled,
    minFeedbackCount: Number.isFinite(min) && min >= 1 ? min : base.minFeedbackCount,
  };
}

interface LearningLoopState {
  totalDecisions: number;
  totalFeedback: number;
  totalUpdates: number;
  lastUpdateTime?: string;
  averageUtility: number;
  convergenceStatus: 'NOT_STARTED' | 'LEARNING' | 'CONVERGING' | 'CONVERGED';
}

@Injectable()
export class OnlineLearningLoopService {
  private readonly logger = new Logger(OnlineLearningLoopService.name);
  private config: OnlineLearningConfig = mergeOnlineLearningConfigFromEnv(DEFAULT_CONFIG);
  private state: LearningLoopState = {
    totalDecisions: 0,
    totalFeedback: 0,
    totalUpdates: 0,
    averageUtility: 0.5,
    convergenceStatus: 'NOT_STARTED',
  };
  private feedbackBuffer: Map<string, DecisionOutcome[]> = new Map();
  private eventLog: LearningEvent[] = [];

  constructor(
    @Optional() private readonly weightLearner?: WeightLearnerService,
    @Optional() private readonly persistence?: WeightPersistenceService,
    @Optional() private readonly regretTracker?: RegretTrackerService,
    @Optional() private readonly differentiableDecision?: DifferentiableDecisionService,
  ) {
    this.logger.log('[OnlineLearningLoop] 服务初始化');
  }

  configure(config: Partial<OnlineLearningConfig>): void {
    this.config = { ...mergeOnlineLearningConfigFromEnv(DEFAULT_CONFIG), ...this.config, ...config };
  }

  recordDecision(decisionId: string, userId: string, dso: DecisionState, predictedUtility: number): void {
    this.state.totalDecisions++;
    if (this.regretTracker && this.config.regretTracking.enabled) {
      this.regretTracker.recordUtility(this.state.totalDecisions, predictedUtility);
    }
  }

  async processDecisionOutcome(outcome: DecisionOutcome): Promise<{
    learningTriggered: boolean;
    weightsUpdated: boolean;
    newWeights?: ObjectiveFunctionWeights;
    regretRecorded: boolean;
    /** 与门面一致：max(0, clamp01(pred) − clamp01(actual))，便于下游与 RLHF 单一数据源 */
    predictionRegret01?: number;
  }> {
    const predictionRegret01 = this.computePredictionRegret01(outcome);
    const regretExtras = predictionRegret01 !== undefined ? { predictionRegret01 } : {};

    if (predictionRegret01 !== undefined) {
      this.recordPredictionRegretEvent(outcome, predictionRegret01);
    }

    if (!this.config.enabled) {
      return { learningTriggered: false, weightsUpdated: false, regretRecorded: false, ...regretExtras };
    }

    const { userId } = outcome;
    this.state.totalFeedback++;

    if (outcome.satisfactionScore !== undefined || outcome.actualUtility !== undefined) {
      if (!this.feedbackBuffer.has(userId)) {
        this.feedbackBuffer.set(userId, []);
      }
      this.feedbackBuffer.get(userId)!.push(outcome);
    }

    let regretRecorded = false;
    if (this.regretTracker && outcome.actualUtility !== undefined) {
      this.regretTracker.recordUtility(this.state.totalFeedback, outcome.actualUtility);
      regretRecorded = true;
    }

    const buffer = this.feedbackBuffer.get(userId) ?? [];
    if (buffer.length < this.config.minFeedbackCount) {
      return { learningTriggered: false, weightsUpdated: false, regretRecorded, ...regretExtras };
    }

    const result = await this.triggerLearning(userId, buffer);
    if (result.flushBuffer) {
      this.feedbackBuffer.set(userId, []);
    }

    const { flushBuffer: _fb, ...rest } = result;
    return { learningTriggered: true, ...rest, regretRecorded, ...regretExtras };
  }

  private computePredictionRegret01(outcome: DecisionOutcome): number | undefined {
    const pred = outcome.predictedUtility;
    const act = outcome.actualUtility;
    if (pred === undefined || act === undefined || !Number.isFinite(pred) || !Number.isFinite(act)) {
      return undefined;
    }
    const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
    return Math.max(0, clamp01(pred) - clamp01(act));
  }

  private recordPredictionRegretEvent(outcome: DecisionOutcome, predictionRegret01: number): void {
    const pred = outcome.predictedUtility!;
    const act = outcome.actualUtility!;
    this.eventLog.push({
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      eventType: 'REGRET_RECORDED',
      timestamp: new Date().toISOString(),
      userId: outcome.userId,
      details: {
        kind: 'PREDICTION_REGRET',
        decisionId: outcome.decisionId,
        predictionRegret01,
        predictedUtility: pred,
        actualUtility: act,
      },
    });
    const maxEvents = 1000;
    if (this.eventLog.length > maxEvents) {
      this.eventLog.splice(0, this.eventLog.length - maxEvents);
    }
  }

  private async triggerLearning(userId: string, outcomes: DecisionOutcome[]): Promise<{
    weightsUpdated: boolean;
    newWeights?: ObjectiveFunctionWeights;
    flushBuffer: boolean;
  }> {
    if (!this.weightLearner) return { weightsUpdated: false, flushBuffer: false };

    const records: FeedbackRecord[] = outcomes
      .filter((o) => o.satisfactionScore !== undefined || o.actualUtility !== undefined)
      .map((o) => {
        const sat = o.satisfactionScore;
        const overallSatisfaction =
          sat === undefined
            ? undefined
            : sat <= 1
              ? Math.min(5, Math.max(1, sat * 5))
              : Math.min(5, Math.max(1, sat));
        const predictionRegret01 = this.computePredictionRegret01(o);
        return {
          id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: o.userId,
          tripId: o.tripId ?? o.decisionId,
          timestamp: o.timestamp,
          type: 'SATISFACTION_RATING' as FeedbackType,
          data: {
            overallSatisfaction,
            completionRate: o.actualUtility,
            ...(o.predictedUtility !== undefined ? { predictedUtility: o.predictedUtility } : {}),
            ...(predictionRegret01 !== undefined ? { predictionRegret01 } : {}),
          },
          weightsAtTime: o.weightsAtFeedback ?? { ...DEFAULT_OBJECTIVE_WEIGHTS },
          utilityAtTime: o.actualUtility ?? sat ?? 0.5,
        };
      });

    if (records.length === 0) return { weightsUpdated: false, flushBuffer: false };

    try {
      const result = await this.weightLearner.learnFromFeedback(
        userId,
        records.slice(-this.config.batchSize),
      );

      this.state.totalUpdates++;
      this.state.lastUpdateTime = new Date().toISOString();

      const hasChange = Object.values(result.weightChanges).some(
        (v) => typeof v === 'number' && Math.abs(v) > 1e-8,
      );

      if (this.config.autoPersist && this.persistence) {
        await this.persistence.saveLearningResult(userId, result);
        if (hasChange) {
          try {
            const existing = await this.persistence.loadUserProfile(userId);
            await this.persistence.saveUserProfile(userId, {
              userId,
              currentWeights: result.updatedWeights,
              weightHistory: existing?.weightHistory ?? [],
              totalFeedback: (existing?.totalFeedback ?? 0) + records.length,
              learningConfidence: result.confidence,
              lastUpdated: new Date().toISOString(),
            });
            this.logger.debug(`[OnlineLearningLoop] 用户权重已持久化 userId=${userId}`);
          } catch (pe: unknown) {
            this.logger.warn(`[OnlineLearningLoop] saveUserProfile 失败: ${(pe as Error)?.message}`);
          }
        }
      }

      return { weightsUpdated: hasChange, newWeights: hasChange ? result.updatedWeights : undefined, flushBuffer: true };
    } catch (e) {
      this.logger.error(`Learning failed: ${(e as Error).message}`);
      return { weightsUpdated: false, flushBuffer: false };
    }
  }

  async trainDifferentiableModel(samples: Array<{ dso: DecisionState; targetUtility: number }>): Promise<{ loss: number; parametersUpdated: boolean }> {
    if (!this.differentiableDecision) return { loss: 0, parametersUpdated: false };
    return this.differentiableDecision.train(samples, { learningRate: this.config.learningRate });
  }

  getState(): LearningLoopState { return { ...this.state }; }
  
  getRegretStatistics(): { cumulativeRegret: number; theoreticalBound: number; totalRounds: number } | null {
    if (!this.regretTracker) return null;
    const T = this.state.totalDecisions;
    return {
      cumulativeRegret: this.regretTracker.getCumulativeRegret(T),
      theoreticalBound: this.regretTracker.getTheoreticalBound(T),
      totalRounds: T,
    };
  }
  
  getEventLog(limit?: number) { return limit ? this.eventLog.slice(-limit) : [...this.eventLog]; }
  
  reset(): void {
    this.state = { totalDecisions: 0, totalFeedback: 0, totalUpdates: 0, averageUtility: 0.5, convergenceStatus: 'NOT_STARTED' };
    this.feedbackBuffer.clear();
    this.eventLog = [];
  }
}
