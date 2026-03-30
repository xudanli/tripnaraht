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
import { ObjectiveFunctionWeights } from '../objective-function.interface';

export interface DecisionOutcome {
  decisionId: string;
  userId: string;
  tripId?: string;
  satisfactionScore?: number;
  actualUtility?: number;
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
  private config: OnlineLearningConfig = DEFAULT_CONFIG;
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
    this.config = { ...this.config, ...config };
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
  }> {
    if (!this.config.enabled) {
      return { learningTriggered: false, weightsUpdated: false, regretRecorded: false };
    }

    const { userId } = outcome;
    this.state.totalFeedback++;

    if (!this.feedbackBuffer.has(userId)) {
      this.feedbackBuffer.set(userId, []);
    }
    this.feedbackBuffer.get(userId)!.push(outcome);

    let regretRecorded = false;
    if (this.regretTracker && outcome.actualUtility !== undefined) {
      this.regretTracker.recordUtility(this.state.totalFeedback, outcome.actualUtility);
      regretRecorded = true;
    }

    const buffer = this.feedbackBuffer.get(userId)!;
    if (buffer.length < this.config.minFeedbackCount) {
      return { learningTriggered: false, weightsUpdated: false, regretRecorded };
    }

    const result = await this.triggerLearning(userId, buffer);
    if (result.weightsUpdated) {
      this.feedbackBuffer.set(userId, []);
    }

    return { learningTriggered: true, ...result, regretRecorded };
  }

  private async triggerLearning(userId: string, outcomes: DecisionOutcome[]): Promise<{
    weightsUpdated: boolean;
    newWeights?: ObjectiveFunctionWeights;
  }> {
    if (!this.weightLearner) return { weightsUpdated: false };

    const records: FeedbackRecord[] = outcomes
      .filter(o => o.satisfactionScore !== undefined || o.actualUtility !== undefined)
      .map(o => ({
        id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: o.userId,
        tripId: o.tripId ?? o.decisionId,
        timestamp: o.timestamp,
        type: (o.explicitFeedback?.type === 'LIKE' ? 'explicit_positive' :
               o.explicitFeedback?.type === 'DISLIKE' ? 'explicit_negative' : 'implicit') as FeedbackType,
        data: {
          overallSatisfaction: o.satisfactionScore,
          completionRate: o.actualUtility,
        },
        weightsAtTime: o.weightsAtFeedback ?? ({} as ObjectiveFunctionWeights),
        utilityAtTime: o.actualUtility ?? 0,
      }));

    if (records.length === 0) return { weightsUpdated: false };

    try {
      const result = await this.weightLearner.learnFromFeedback(
        userId,
        records.slice(-this.config.batchSize),
      );
      
      this.state.totalUpdates++;
      this.state.lastUpdateTime = new Date().toISOString();

      if (this.config.autoPersist && this.persistence) {
        await this.persistence.saveLearningResult(userId, result);
      }

      return { weightsUpdated: true, newWeights: result.updatedWeights };
    } catch (e) {
      this.logger.error(`Learning failed: ${(e as Error).message}`);
      return { weightsUpdated: false };
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
