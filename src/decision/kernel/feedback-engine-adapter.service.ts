/**
 * Feedback Engine Adapter Service
 *
 * Phase C: 反馈学习模块统一接入 Kernel（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN）
 * 专利：反馈学习模块用于记录决策日志、用户反馈并更新系统参数
 *
 * 委托 RLHFSignalCollector 等现有服务，不重复实现
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionState } from './decision-state.types';
import { RLHFSignalCollectorService } from '../../agent/services/rlhf-signal-collector.service';
import type { RecordOutcomeCaptureParams } from './outcome-capture.types';

export interface RecordUserFeedbackParams {
  tripRunId: string;
  userId: string;
  decisionPointId?: string;
  feedbackType: 'ACCEPT' | 'REJECT' | 'MODIFY' | 'RATING' | 'COMMENT';
  value?: unknown;
  context?: Record<string, unknown>;
  /** Scheme D: Behavior Log - 修改前后状态差分 */
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

/** 学习信号（供 RL/模型调优） */
export interface LearningSignal {
  signal_id: string;
  timestamp: string;
  signal_category: string;
  signal_strength: number;
  observation: Record<string, unknown>;
  learning_target: Record<string, unknown>;
}

@Injectable()
export class FeedbackEngineAdapterService {
  private readonly logger = new Logger(FeedbackEngineAdapterService.name);

  constructor(
    @Optional() private readonly rlhfCollector?: RLHFSignalCollectorService,
  ) {}

  /**
   * 记录决策完成时的日志（DSO history + confidence + 阶段摘要）
   * Scheme D: 四层反馈飞轮 - 结构化写入 contextSnapshot、utilityWeights、candidatePlans、selectedPlan
   * 异步写入，不阻塞主流程
   */
  async recordDecisionLog(state: DecisionState, stage: string): Promise<void> {
    const tripRunId = state.systemState?.requestId ?? state.requestId ?? '';
    if (!tripRunId) {
      this.logger.debug('[FeedbackAdapter] 跳过 recordDecisionLog: 无 requestId');
      return;
    }

    const summary = this.buildDecisionLogSummary(state, stage);
    this.logger.debug(`[FeedbackAdapter] recordDecisionLog: stage=${stage}, confidence=${state.confidence ?? 'N/A'}`);

    if (this.rlhfCollector) {
      try {
        const contextSnapshot = this.buildContextSnapshot(state);
        const utilityWeights = state.optimizationHints?.expectedUtilityWeights ?? state.optimizationHints?.weightSummary;
        const candidatePlansCount = state.candidates?.length ?? 0;
        const selectedPlanSummary = this.buildSelectedPlanSummary(state);

        this.rlhfCollector.recordFeedbackSignal({
          trip_run_id: tripRunId,
          decision_point_id: `dso_${stage}_${Date.now()}`,
          feedback_type: 'COMMENT',
          value: { comment: summary },
          context: {
            decision_output_summary: `${summary} | stage=${stage} confidence=${state.confidence ?? 'N/A'} version=${state.systemState?.version ?? 'N/A'}`,
            user_query: undefined,
            contextSnapshot: Object.keys(contextSnapshot).length > 0 ? contextSnapshot : undefined,
            utilityWeights: utilityWeights && Object.keys(utilityWeights).length > 0 ? utilityWeights : undefined,
            candidatePlansCount: candidatePlansCount > 0 ? candidatePlansCount : undefined,
            selectedPlanSummary: selectedPlanSummary || undefined,
          },
        });
      } catch (e: unknown) {
        this.logger.warn(`[FeedbackAdapter] recordDecisionLog 失败: ${(e as Error)?.message}`);
      }
    }
  }

  /** Scheme D: 构建 contextSnapshot（决策上下文快照） */
  private buildContextSnapshot(state: DecisionState): Record<string, unknown> {
    const snap: Record<string, unknown> = {};
    if (state.userIntent && Object.keys(state.userIntent).length > 0) {
      snap.userIntent = { ...state.userIntent };
    }
    if (state.environmentState && Object.keys(state.environmentState).length > 0) {
      snap.environmentState = { ...state.environmentState };
    }
    if (state.worldStateSummary && Object.keys(state.worldStateSummary).length > 0) {
      snap.worldStateSummary = state.worldStateSummary;
    }
    if (state.constraints) {
      snap.constraints = { feasible: state.constraints.feasible, violationsCount: state.constraints.violations?.length ?? 0 };
    }
    if (state.decisionMeta) snap.decisionMeta = state.decisionMeta;
    if (state.confidence !== undefined) snap.confidence = state.confidence;
    return snap;
  }

  /** Scheme D: 构建 selectedPlan 摘要（不存全量，仅摘要） */
  private buildSelectedPlanSummary(state: DecisionState): string | null {
    const planDraft = state.tripState?.planDraft as { days?: unknown[] } | undefined;
    if (!planDraft?.days?.length) return null;
    const dayCount = planDraft.days.length;
    const itemCount = planDraft.days.reduce(
      (sum: number, d) => sum + (((d as { items?: unknown[] })?.items?.length as number) ?? 0),
      0,
    );
    return `days=${dayCount}, items=${itemCount}`;
  }

  /**
   * 记录用户反馈（接受/拒绝/评分等）
   */
  async recordUserFeedback(params: RecordUserFeedbackParams): Promise<void> {
    if (!this.rlhfCollector) {
      this.logger.debug('[FeedbackAdapter] RLHF 未注入，跳过 recordUserFeedback');
      return;
    }

    try {
      const { tripRunId, userId, decisionPointId, feedbackType, value, context, beforeState, afterState } = params;
      const v = (value as Record<string, unknown>) ?? {};
      const ctx: Record<string, unknown> = { ...(context ?? {}) };
      if (beforeState && Object.keys(beforeState).length > 0) ctx.beforeState = beforeState;
      if (afterState && Object.keys(afterState).length > 0) ctx.afterState = afterState;

      this.rlhfCollector.recordFeedbackSignal({
        trip_run_id: tripRunId,
        user_id: userId,
        decision_point_id: decisionPointId ?? `feedback_${Date.now()}`,
        feedback_type: feedbackType,
        value: {
          rating: v.rating as number | undefined,
          choice: v.choice as string | undefined,
          comment: v.comment as string | undefined,
          modification: v.modification as { field: string; from: unknown; to: unknown } | undefined,
        },
        context: ctx,
      });
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] recordUserFeedback 失败: ${(e as Error)?.message}`);
    }
  }

  /**
   * Scheme D 第 3 层：Outcome Capture - 统一采集执行结果与主观反馈
   * satisfaction、fatigueLevel、actualCost、planAbandoned、daySkipped
   */
  async recordOutcomeCapture(params: RecordOutcomeCaptureParams): Promise<void> {
    if (!this.rlhfCollector) {
      this.logger.debug('[FeedbackAdapter] RLHF 未注入，跳过 recordOutcomeCapture');
      return;
    }

    const { tripRunId, userId, subjective, objective, failure, usedBlockKeys, context } = params;
    const outcomeCapture: Record<string, unknown> = { ...(context ?? {}) };
    if (subjective) {
      if (subjective.satisfaction !== undefined) outcomeCapture.satisfaction = subjective.satisfaction;
      if (subjective.fatigueLevel !== undefined) outcomeCapture.fatigueLevel = subjective.fatigueLevel;
      if (subjective.paceFeeling) outcomeCapture.paceFeeling = subjective.paceFeeling;
      if (subjective.budgetFeeling) outcomeCapture.budgetFeeling = subjective.budgetFeeling;
    }
    if (objective) {
      if (objective.actualCost !== undefined) outcomeCapture.actualCost = objective.actualCost;
      if (objective.actualDuration !== undefined) outcomeCapture.actualDuration = objective.actualDuration;
      if (objective.actualDistance !== undefined) outcomeCapture.actualDistance = objective.actualDistance;
      if (objective.weatherDeviation) outcomeCapture.weatherDeviation = objective.weatherDeviation;
      if (objective.delayEvents?.length) outcomeCapture.delayEvents = objective.delayEvents;
    }
    if (failure) {
      if (failure.planAbandoned !== undefined) outcomeCapture.planAbandoned = failure.planAbandoned;
      if (failure.daySkipped?.length) outcomeCapture.daySkipped = failure.daySkipped;
      if (failure.earlyReturn !== undefined) outcomeCapture.earlyReturn = failure.earlyReturn;
    }
    if (usedBlockKeys?.length) outcomeCapture.usedBlockKeys = usedBlockKeys;

    if (Object.keys(outcomeCapture).length === 0) {
      this.logger.debug('[FeedbackAdapter] recordOutcomeCapture 无有效数据，跳过');
      return;
    }

    try {
      const summary = [
        outcomeCapture.satisfaction !== undefined && `satisfaction=${outcomeCapture.satisfaction}`,
        outcomeCapture.fatigueLevel !== undefined && `fatigueLevel=${outcomeCapture.fatigueLevel}`,
        outcomeCapture.actualCost !== undefined && `actualCost=${outcomeCapture.actualCost}`,
        outcomeCapture.planAbandoned !== undefined && `planAbandoned=${outcomeCapture.planAbandoned}`,
        outcomeCapture.daySkipped && `daySkipped=${(outcomeCapture.daySkipped as string[]).join(',')}`,
      ]
        .filter(Boolean)
        .join(', ');

      this.rlhfCollector.recordFeedbackSignal({
        trip_run_id: tripRunId,
        user_id: userId,
        decision_point_id: `outcome_${Date.now()}`,
        feedback_type: 'COMMENT',
        value: { comment: `Outcome: ${summary}` },
        context: {
          decision_output_summary: summary,
          outcomeCapture,
        },
      });
      this.logger.debug(`[FeedbackAdapter] recordOutcomeCapture: ${summary}`);
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] recordOutcomeCapture 失败: ${(e as Error)?.message}`);
    }
  }

  /**
   * 获取学习信号（供 RL/模型调优）
   */
  async getLearningSignals(tripRunId: string): Promise<LearningSignal[]> {
    if (!this.rlhfCollector) return [];
    try {
      return this.rlhfCollector.generateLearningSignals(tripRunId) as LearningSignal[];
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] getLearningSignals 失败: ${(e as Error)?.message}`);
      return [];
    }
  }

  private buildDecisionLogSummary(state: DecisionState, stage: string): string {
    const parts: string[] = [`stage=${stage}`];
    if (state.confidence !== undefined) parts.push(`confidence=${state.confidence.toFixed(2)}`);
    if (state.systemState?.version !== undefined) parts.push(`version=${state.systemState.version}`);
    if (state.constraints?.feasible !== undefined) parts.push(`feasible=${state.constraints.feasible}`);
    if (state.history?.length) parts.push(`historyEntries=${state.history.length}`);
    return parts.join(', ');
  }
}
