// src/agent/services/rlhf-signal-collector.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DecisionOutput, TradeoffDimension } from '../interfaces/decision-node.interface';

/**
 * 行为信号
 */
export interface BehaviorSignal {
  signal_id: string;
  timestamp: string;
  user_id?: string;
  trip_run_id: string;
  signal_type: 'VIEW' | 'CLICK' | 'HOVER' | 'SCROLL' | 'TIME_SPENT' | 'EXPAND' | 'COLLAPSE';
  target: {
    element_type: 'PLAN' | 'OPTION' | 'COMPARISON' | 'RISK' | 'TRADEOFF' | 'DETAIL';
    element_id: string;
    element_context?: string;
  };
  metadata?: {
    duration_ms?: number;
    scroll_depth?: number;
    viewport_visible?: boolean;
  };
}

/**
 * 执行信号
 */
export interface ExecutionSignal {
  signal_id: string;
  timestamp: string;
  trip_run_id: string;
  signal_type: 'START' | 'DEVIATION' | 'SKIP' | 'DELAY' | 'EARLY' | 'COMPLETE' | 'ABORT';
  context: {
    planned_item_id: string;
    planned_time?: string;
    actual_time?: string;
    deviation_minutes?: number;
    reason?: string;
  };
}

/**
 * 反馈信号
 */
export interface FeedbackSignal {
  signal_id: string;
  timestamp: string;
  user_id?: string;
  trip_run_id: string;
  decision_point_id: string;
  feedback_type: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'QUESTION' | 'RATING' | 'COMMENT';
  value: {
    rating?: number;
    choice?: string;
    modification?: { field: string; from: any; to: any };
    comment?: string;
  };
  context: {
    decision_output_summary?: string;
    user_query?: string;
    /** Scheme D: 四层反馈飞轮 - 结构化决策日志 */
    contextSnapshot?: Record<string, unknown>;
    utilityWeights?: Record<string, number>;
    candidatePlansCount?: number;
    selectedPlanSummary?: string;
    /** Scheme D: Behavior Log - 修改前后状态差分 */
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    /** Scheme D: Outcome Capture - 执行结果与主观反馈 */
    outcomeCapture?: {
      satisfaction?: number;
      fatigueLevel?: number;
      actualCost?: number;
      planAbandoned?: boolean;
      daySkipped?: string[];
      [key: string]: unknown;
    };
  };
}

/**
 * 决策质量评估
 */
export interface DecisionQualityAssessment {
  trip_run_id: string;
  decision_point_id: string;
  assessed_at: string;
  metrics: {
    prediction_accuracy: number;
    user_satisfaction: number;
    execution_adherence: number;
    overall_quality: number;
  };
  factors: Array<{
    factor: string;
    score: number;
    weight: number;
    evidence: string;
  }>;
  improvement_signals: Array<{
    signal_type: string;
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
}

/**
 * 学习信号
 */
export interface LearningSignal {
  signal_id: string;
  timestamp: string;
  signal_category: 'PREFERENCE' | 'CONSTRAINT' | 'TRADEOFF' | 'RISK' | 'BEHAVIOR';
  signal_strength: number;
  observation: {
    context: string;
    user_action: string;
    system_prediction?: string;
    actual_outcome?: string;
  };
  learning_target: {
    model_component: 'RANKING' | 'PREFERENCE' | 'CONSTRAINT' | 'RISK';
    adjustment_direction: 'INCREASE' | 'DECREASE' | 'ADJUST';
    adjustment_magnitude: number;
  };
}

/**
 * RLHF Signal Collector Service
 * 
 * AI-Native 信号与反馈收集服务
 * 
 * 核心功能：
 * - 收集行为信号（用户交互）
 * - 收集执行信号（行程执行偏差）
 * - 收集反馈信号（显式反馈）
 * - 生成学习信号（用于模型调优）
 * 
 * 设计原则：
 * - 被动收集：不打扰用户
 * - 多维度：行为 + 执行 + 反馈
 * - 闭环学习：信号 → 质量评估 → 学习信号 → 模型更新
 */
@Injectable()
export class RLHFSignalCollectorService {
  private readonly logger = new Logger(RLHFSignalCollectorService.name);

  // 内存缓存（用于快速访问，数据库为持久化存储）
  private behaviorSignalsCache: Map<string, BehaviorSignal[]> = new Map();
  private executionSignalsCache: Map<string, ExecutionSignal[]> = new Map();
  private feedbackSignalsCache: Map<string, FeedbackSignal[]> = new Map();
  private qualityAssessmentsCache: Map<string, DecisionQualityAssessment[]> = new Map();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
  ) {
    this.logger.log('[RLHFSignalCollector] Initialized' + (prisma ? ' with Prisma persistence' : ' (memory only)'));
  }

  // ============================================================================
  // 行为信号收集
  // ============================================================================

  /**
   * 记录行为信号
   */
  recordBehaviorSignal(signal: Omit<BehaviorSignal, 'signal_id' | 'timestamp'>): BehaviorSignal {
    const fullSignal: BehaviorSignal = {
      ...signal,
      signal_id: `beh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // 更新内存缓存
    const signals = this.behaviorSignalsCache.get(signal.trip_run_id) || [];
    signals.push(fullSignal);
    this.behaviorSignalsCache.set(signal.trip_run_id, signals);

    // 异步持久化到数据库
    this.persistBehaviorSignal(fullSignal).catch(e =>
      this.logger.warn(`[RLHF] Failed to persist behavior signal: ${e?.message}`)
    );

    this.logger.debug(`[RLHF] Behavior signal: ${signal.signal_type} on ${signal.target.element_type}`);

    return fullSignal;
  }

  /**
   * 持久化行为信号到数据库
   */
  private async persistBehaviorSignal(signal: BehaviorSignal): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO rlhf_behavior_signals (signal_id, trip_run_id, user_id, signal_type, element_type, element_id, element_context, duration_ms, scroll_depth, viewport_visible, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.user_id || null}, ${signal.signal_type}, ${signal.target.element_type}, ${signal.target.element_id}, ${signal.target.element_context || null}, ${signal.metadata?.duration_ms || null}, ${signal.metadata?.scroll_depth || null}, ${signal.metadata?.viewport_visible ?? null}, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
    } catch (e: any) {
      this.logger.warn(`[RLHF] DB persist error (behavior): ${e?.message}`);
    }
  }

  /**
   * 记录用户查看方案的时间
   */
  recordPlanViewTime(tripRunId: string, planId: string, durationMs: number): void {
    this.recordBehaviorSignal({
      trip_run_id: tripRunId,
      signal_type: 'TIME_SPENT',
      target: {
        element_type: 'PLAN',
        element_id: planId,
      },
      metadata: { duration_ms: durationMs },
    });
  }

  /**
   * 记录用户展开/收起详情
   */
  recordDetailInteraction(
    tripRunId: string,
    elementType: BehaviorSignal['target']['element_type'],
    elementId: string,
    action: 'EXPAND' | 'COLLAPSE',
  ): void {
    this.recordBehaviorSignal({
      trip_run_id: tripRunId,
      signal_type: action,
      target: {
        element_type: elementType,
        element_id: elementId,
      },
    });
  }

  // ============================================================================
  // 执行信号收集
  // ============================================================================

  /**
   * 记录执行信号
   */
  recordExecutionSignal(signal: Omit<ExecutionSignal, 'signal_id' | 'timestamp'>): ExecutionSignal {
    const fullSignal: ExecutionSignal = {
      ...signal,
      signal_id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    const signals = this.executionSignalsCache.get(signal.trip_run_id) || [];
    signals.push(fullSignal);
    this.executionSignalsCache.set(signal.trip_run_id, signals);

    // 异步持久化到数据库
    this.persistExecutionSignal(fullSignal).catch(e =>
      this.logger.warn(`[RLHF] Failed to persist execution signal: ${e?.message}`)
    );

    this.logger.debug(`[RLHF] Execution signal: ${signal.signal_type} for item ${signal.context.planned_item_id}`);

    return fullSignal;
  }

  /**
   * 持久化执行信号到数据库
   */
  private async persistExecutionSignal(signal: ExecutionSignal): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO rlhf_execution_signals (signal_id, trip_run_id, signal_type, planned_item_id, planned_time, actual_time, deviation_minutes, reason, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.signal_type}, ${signal.context.planned_item_id}, ${signal.context.planned_time || null}::timestamptz, ${signal.context.actual_time || null}::timestamptz, ${signal.context.deviation_minutes || null}, ${signal.context.reason || null}, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
    } catch (e: any) {
      this.logger.warn(`[RLHF] DB persist error (execution): ${e?.message}`);
    }
  }

  /**
   * 记录行程偏差
   */
  recordDeviation(
    tripRunId: string,
    plannedItemId: string,
    plannedTime: string,
    actualTime: string,
    reason?: string,
  ): void {
    const planned = new Date(plannedTime).getTime();
    const actual = new Date(actualTime).getTime();
    const deviationMinutes = Math.round((actual - planned) / 60000);

    const signalType: ExecutionSignal['signal_type'] = 
      deviationMinutes > 30 ? 'DEVIATION' :
      deviationMinutes > 0 ? 'DELAY' :
      deviationMinutes < -15 ? 'EARLY' : 'START';

    this.recordExecutionSignal({
      trip_run_id: tripRunId,
      signal_type: signalType,
      context: {
        planned_item_id: plannedItemId,
        planned_time: plannedTime,
        actual_time: actualTime,
        deviation_minutes: deviationMinutes,
        reason,
      },
    });
  }

  /**
   * 记录跳过的活动
   */
  recordSkippedActivity(tripRunId: string, plannedItemId: string, reason: string): void {
    this.recordExecutionSignal({
      trip_run_id: tripRunId,
      signal_type: 'SKIP',
      context: {
        planned_item_id: plannedItemId,
        reason,
      },
    });
  }

  // ============================================================================
  // 反馈信号收集
  // ============================================================================

  /**
   * 记录反馈信号
   */
  recordFeedbackSignal(signal: Omit<FeedbackSignal, 'signal_id' | 'timestamp'>): FeedbackSignal {
    const fullSignal: FeedbackSignal = {
      ...signal,
      signal_id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    const signals = this.feedbackSignalsCache.get(signal.trip_run_id) || [];
    signals.push(fullSignal);
    this.feedbackSignalsCache.set(signal.trip_run_id, signals);

    // 异步持久化到数据库
    this.persistFeedbackSignal(fullSignal).catch(e =>
      this.logger.warn(`[RLHF] Failed to persist feedback signal: ${e?.message}`)
    );

    this.logger.debug(`[RLHF] Feedback signal: ${signal.feedback_type} for decision ${signal.decision_point_id}`);

    return fullSignal;
  }

  /**
   * 持久化反馈信号到数据库
   */
  private async persistFeedbackSignal(signal: FeedbackSignal): Promise<void> {
    if (!this.prisma) return;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO rlhf_feedback_signals (signal_id, trip_run_id, user_id, decision_point_id, feedback_type, rating, choice, modification, comment, context, timestamp)
        VALUES (${signal.signal_id}, ${signal.trip_run_id}, ${signal.user_id || null}, ${signal.decision_point_id}, ${signal.feedback_type}, ${signal.value.rating || null}, ${signal.value.choice || null}, ${signal.value.modification ? JSON.stringify(signal.value.modification) : null}::jsonb, ${signal.value.comment || null}, ${JSON.stringify(signal.context)}::jsonb, ${signal.timestamp}::timestamptz)
        ON CONFLICT (signal_id) DO NOTHING
      `;
    } catch (e: any) {
      this.logger.warn(`[RLHF] DB persist error (feedback): ${e?.message}`);
    }
  }

  /**
   * 记录用户接受推荐
   */
  recordAcceptance(tripRunId: string, decisionPointId: string, chosenOptionId: string): void {
    this.recordFeedbackSignal({
      trip_run_id: tripRunId,
      decision_point_id: decisionPointId,
      feedback_type: 'ACCEPT',
      value: { choice: chosenOptionId },
      context: {},
    });
  }

  /**
   * 记录用户拒绝推荐
   */
  recordRejection(tripRunId: string, decisionPointId: string, reason?: string): void {
    this.recordFeedbackSignal({
      trip_run_id: tripRunId,
      decision_point_id: decisionPointId,
      feedback_type: 'REJECT',
      value: { comment: reason },
      context: {},
    });
  }

  /**
   * 记录用户修改
   */
  recordModification(
    tripRunId: string,
    decisionPointId: string,
    field: string,
    fromValue: any,
    toValue: any,
  ): void {
    this.recordFeedbackSignal({
      trip_run_id: tripRunId,
      decision_point_id: decisionPointId,
      feedback_type: 'MODIFY',
      value: { modification: { field, from: fromValue, to: toValue } },
      context: {},
    });
  }

  /**
   * 记录用户评分
   */
  recordRating(tripRunId: string, decisionPointId: string, rating: number, comment?: string): void {
    this.recordFeedbackSignal({
      trip_run_id: tripRunId,
      decision_point_id: decisionPointId,
      feedback_type: 'RATING',
      value: { rating, comment },
      context: {},
    });
  }

  // ============================================================================
  // 决策质量评估
  // ============================================================================

  /**
   * 评估决策质量
   */
  assessDecisionQuality(
    tripRunId: string,
    decisionPointId: string,
    decisionOutput: DecisionOutput,
  ): DecisionQualityAssessment {
    const behaviorSignals = this.behaviorSignalsCache.get(tripRunId) || [];
    const executionSignals = this.executionSignalsCache.get(tripRunId) || [];
    const feedbackSignals = this.feedbackSignalsCache.get(tripRunId) || [];

    // 计算各项指标
    const predictionAccuracy = this.calculatePredictionAccuracy(decisionOutput, executionSignals);
    const userSatisfaction = this.calculateUserSatisfaction(feedbackSignals);
    const executionAdherence = this.calculateExecutionAdherence(executionSignals);

    const overallQuality = (
      predictionAccuracy * 0.3 +
      userSatisfaction * 0.4 +
      executionAdherence * 0.3
    );

    // 识别改进信号
    const improvementSignals = this.identifyImprovementSignals(
      behaviorSignals,
      executionSignals,
      feedbackSignals,
    );

    const assessment: DecisionQualityAssessment = {
      trip_run_id: tripRunId,
      decision_point_id: decisionPointId,
      assessed_at: new Date().toISOString(),
      metrics: {
        prediction_accuracy: predictionAccuracy,
        user_satisfaction: userSatisfaction,
        execution_adherence: executionAdherence,
        overall_quality: overallQuality,
      },
      factors: [
        { factor: 'Prediction Accuracy', score: predictionAccuracy, weight: 0.3, evidence: 'Based on execution signals' },
        { factor: 'User Satisfaction', score: userSatisfaction, weight: 0.4, evidence: 'Based on feedback signals' },
        { factor: 'Execution Adherence', score: executionAdherence, weight: 0.3, evidence: 'Based on deviation signals' },
      ],
      improvement_signals: improvementSignals,
    };

    // 存储评估结果
    const assessments = this.qualityAssessmentsCache.get(tripRunId) || [];
    assessments.push(assessment);
    this.qualityAssessmentsCache.set(tripRunId, assessments);

    this.logger.debug(`[RLHF] Quality assessment: overall=${overallQuality.toFixed(2)}`);

    return assessment;
  }

  // ============================================================================
  // 学习信号生成
  // ============================================================================

  /**
   * 生成学习信号
   */
  generateLearningSignals(tripRunId: string): LearningSignal[] {
    const learningSignals: LearningSignal[] = [];

    const behaviorSignals = this.behaviorSignalsCache.get(tripRunId) || [];
    const executionSignals = this.executionSignalsCache.get(tripRunId) || [];
    const feedbackSignals = this.feedbackSignalsCache.get(tripRunId) || [];

    // 从行为信号学习偏好
    const planViewTimes = behaviorSignals
      .filter(s => s.signal_type === 'TIME_SPENT' && s.target.element_type === 'PLAN')
      .map(s => ({ planId: s.target.element_id, duration: s.metadata?.duration_ms || 0 }));

    if (planViewTimes.length > 0) {
      const avgViewTime = planViewTimes.reduce((sum, p) => sum + p.duration, 0) / planViewTimes.length;
      const maxViewPlan = planViewTimes.reduce((max, p) => p.duration > max.duration ? p : max);

      if (maxViewPlan.duration > avgViewTime * 1.5) {
        learningSignals.push({
          signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toISOString(),
          signal_category: 'PREFERENCE',
          signal_strength: 0.6,
          observation: {
            context: 'Plan comparison',
            user_action: `Spent ${Math.round(maxViewPlan.duration / 1000)}s on plan ${maxViewPlan.planId}`,
          },
          learning_target: {
            model_component: 'RANKING',
            adjustment_direction: 'INCREASE',
            adjustment_magnitude: 0.1,
          },
        });
      }
    }

    // 从执行偏差学习约束
    const deviations = executionSignals.filter(s => s.signal_type === 'DEVIATION' || s.signal_type === 'SKIP');
    for (const deviation of deviations) {
      learningSignals.push({
        signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        signal_category: 'CONSTRAINT',
        signal_strength: deviation.signal_type === 'SKIP' ? 0.8 : 0.5,
        observation: {
          context: 'Execution deviation',
          user_action: deviation.signal_type === 'SKIP' ? 'Skipped activity' : 'Significant time deviation',
          actual_outcome: deviation.context.reason,
        },
        learning_target: {
          model_component: 'CONSTRAINT',
          adjustment_direction: 'ADJUST',
          adjustment_magnitude: 0.15,
        },
      });
    }

    // 从反馈学习偏好
    const rejections = feedbackSignals.filter(s => s.feedback_type === 'REJECT');
    for (const rejection of rejections) {
      learningSignals.push({
        signal_id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        signal_category: 'PREFERENCE',
        signal_strength: 0.9,
        observation: {
          context: 'User rejection',
          user_action: 'Rejected recommendation',
          actual_outcome: rejection.value.comment,
        },
        learning_target: {
          model_component: 'PREFERENCE',
          adjustment_direction: 'DECREASE',
          adjustment_magnitude: 0.2,
        },
      });
    }

    this.logger.debug(`[RLHF] Generated ${learningSignals.length} learning signals`);

    return learningSignals;
  }

  // ============================================================================
  // 获取和聚合
  // ============================================================================

  /**
   * 获取信号摘要
   */
  getSignalSummary(tripRunId: string): {
    behavior_count: number;
    execution_count: number;
    feedback_count: number;
    deviations: number;
    skips: number;
    acceptances: number;
    rejections: number;
    avg_rating?: number;
  } {
    const behavior = this.behaviorSignalsCache.get(tripRunId) || [];
    const execution = this.executionSignalsCache.get(tripRunId) || [];
    const feedback = this.feedbackSignalsCache.get(tripRunId) || [];

    const ratings = feedback
      .filter(f => f.feedback_type === 'RATING' && f.value.rating !== undefined)
      .map(f => f.value.rating!);

    return {
      behavior_count: behavior.length,
      execution_count: execution.length,
      feedback_count: feedback.length,
      deviations: execution.filter(e => e.signal_type === 'DEVIATION').length,
      skips: execution.filter(e => e.signal_type === 'SKIP').length,
      acceptances: feedback.filter(f => f.feedback_type === 'ACCEPT').length,
      rejections: feedback.filter(f => f.feedback_type === 'REJECT').length,
      avg_rating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : undefined,
    };
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private calculatePredictionAccuracy(
    decisionOutput: DecisionOutput,
    executionSignals: ExecutionSignal[],
  ): number {
    if (executionSignals.length === 0) return 0.7; // 默认值

    const completedCount = executionSignals.filter(s => s.signal_type === 'COMPLETE').length;
    const skippedCount = executionSignals.filter(s => s.signal_type === 'SKIP').length;
    const deviationCount = executionSignals.filter(s => s.signal_type === 'DEVIATION').length;

    const total = completedCount + skippedCount + deviationCount;
    if (total === 0) return 0.7;

    return Math.max(0, Math.min(1, (completedCount - skippedCount * 0.5 - deviationCount * 0.3) / total + 0.5));
  }

  private calculateUserSatisfaction(feedbackSignals: FeedbackSignal[]): number {
    if (feedbackSignals.length === 0) return 0.5; // 默认值

    const acceptCount = feedbackSignals.filter(f => f.feedback_type === 'ACCEPT').length;
    const rejectCount = feedbackSignals.filter(f => f.feedback_type === 'REJECT').length;
    const ratings = feedbackSignals
      .filter(f => f.feedback_type === 'RATING' && f.value.rating !== undefined)
      .map(f => f.value.rating! / 5);

    if (ratings.length > 0) {
      return ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }

    const total = acceptCount + rejectCount;
    if (total === 0) return 0.5;

    return acceptCount / total;
  }

  private calculateExecutionAdherence(executionSignals: ExecutionSignal[]): number {
    if (executionSignals.length === 0) return 0.7; // 默认值

    const onTimeCount = executionSignals.filter(s => 
      s.signal_type === 'START' || s.signal_type === 'COMPLETE'
    ).length;
    const deviationCount = executionSignals.filter(s => 
      s.signal_type === 'DEVIATION' || s.signal_type === 'SKIP' || s.signal_type === 'ABORT'
    ).length;

    const total = onTimeCount + deviationCount;
    if (total === 0) return 0.7;

    return onTimeCount / total;
  }

  private identifyImprovementSignals(
    behaviorSignals: BehaviorSignal[],
    executionSignals: ExecutionSignal[],
    feedbackSignals: FeedbackSignal[],
  ): DecisionQualityAssessment['improvement_signals'] {
    const signals: DecisionQualityAssessment['improvement_signals'] = [];

    // 检查高频跳过
    const skipCount = executionSignals.filter(s => s.signal_type === 'SKIP').length;
    if (skipCount > 2) {
      signals.push({
        signal_type: 'HIGH_SKIP_RATE',
        description: `${skipCount} activities were skipped - consider adjusting pace or activity density`,
        priority: 'HIGH',
      });
    }

    // 检查拒绝
    const rejectCount = feedbackSignals.filter(f => f.feedback_type === 'REJECT').length;
    if (rejectCount > 0) {
      signals.push({
        signal_type: 'USER_REJECTION',
        description: `${rejectCount} recommendation(s) rejected - review preference alignment`,
        priority: 'HIGH',
      });
    }

    // 检查低评分
    const lowRatings = feedbackSignals.filter(f => 
      f.feedback_type === 'RATING' && f.value.rating !== undefined && f.value.rating < 3
    );
    if (lowRatings.length > 0) {
      signals.push({
        signal_type: 'LOW_RATING',
        description: `${lowRatings.length} low rating(s) received - investigate user concerns`,
        priority: 'MEDIUM',
      });
    }

    return signals;
  }
}
