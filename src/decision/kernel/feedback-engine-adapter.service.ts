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
import type {
  RlhfDilemmaElicitationSnapshot,
  RlhfObservationHarnessSnapshot,
} from '../../agent/services/rlhf-decision-context.types';
import { evaluateNonSemanticKvInfluence } from '../../agent/services/json-kv-influence-evaluator';

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
        const observationHarness = this.buildRlhfObservationHarnessSnapshot(state);
        const dilemmaElicitationHint = this.buildRlhfDilemmaElicitationSnapshot(state);

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
            ...(observationHarness ? { observationHarness } : {}),
            ...(dilemmaElicitationHint ? { dilemmaElicitationHint } : {}),
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
  /**
   * 效用补偿 / REPAIR 澄清：用户选择（与 escalationPlan.correlationId join）
   */
  async recordUserRepairResolutionSignal(params: {
    tripRunId: string;
    userId: string;
    correlationId: string;
    resolution: string;
    feedbackPhase?: 'INTAKE' | 'REPAIR';
  }): Promise<void> {
    if (!this.rlhfCollector) {
      this.logger.debug('[FeedbackAdapter] RLHF 未注入，跳过 recordUserRepairResolutionSignal');
      return;
    }
    try {
      this.rlhfCollector.recordFeedbackSignal({
        trip_run_id: params.tripRunId,
        user_id: params.userId,
        decision_point_id: `user_repair_resolution:${params.correlationId}`,
        feedback_type: 'COMMENT',
        value: { comment: `USER_REPAIR_RESOLUTION=${params.resolution}` },
        context: {
          correlation_id: params.correlationId,
          user_repair_resolution: params.resolution,
          feedback_phase: params.feedbackPhase ?? 'REPAIR',
        },
      });
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] recordUserRepairResolutionSignal 失败: ${(e as Error)?.message}`);
    }
  }

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

      const je = params.rlhfJsonEval;
      const jsonKvInfluence =
        je && (je.contextSnapshot || je.utilityWeights || je.modification)
          ? evaluateNonSemanticKvInfluence({
              contextSnapshot: je.contextSnapshot,
              utilityWeights: je.utilityWeights,
              modification: je.modification,
              outcomeCapture,
            })
          : undefined;

      this.rlhfCollector.recordFeedbackSignal({
        trip_run_id: tripRunId,
        user_id: userId,
        decision_point_id: `outcome_${Date.now()}`,
        feedback_type: 'COMMENT',
        value: { comment: `Outcome: ${summary}` },
        context: {
          decision_output_summary: summary,
          outcomeCapture,
          ...(jsonKvInfluence && jsonKvInfluence.entries.length > 0 ? { jsonKvInfluence } : {}),
        },
      });
      this.logger.debug(`[FeedbackAdapter] recordOutcomeCapture: ${summary}`);
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] recordOutcomeCapture 失败: ${(e as Error)?.message}`);
    }
  }

  /**
   * 记录创建行程决策日志（四层飞轮 Layer 1）
   * 用于 from-natural-language 等未走 Decision Kernel 的创建行程流程
   * 专利：反馈学习模块记录决策日志
   */
  async recordCreateTripDecisionLog(params: {
    tripRunId: string;
    tripId: string;
    userInput: string;
    parsedParams: Record<string, unknown>;
    tripParams: {
      destination: string;
      startDate: string;
      endDate: string;
      days: number;
      totalBudget: number;
      hasChildren?: boolean;
      hasElderly?: boolean;
      preferences?: Record<string, unknown>;
    };
    decisionDraftId: string;
    decisionStepsCount: number;
  }): Promise<void> {
    if (!this.rlhfCollector) {
      this.logger.debug('[FeedbackAdapter] 跳过 recordCreateTripDecisionLog: RLHF 未注入');
      return;
    }

    try {
      const { tripRunId, userInput, parsedParams, tripParams, decisionDraftId, decisionStepsCount } = params;
      const contextSnapshot: Record<string, unknown> = {
        userIntent: {
          destination: tripParams.destination,
          dateRange: { startDate: tripParams.startDate, endDate: tripParams.endDate },
          days: tripParams.days,
          party: {
            count: 1 + (tripParams.hasChildren ? 1 : 0) + (tripParams.hasElderly ? 1 : 0),
            has_children: tripParams.hasChildren,
            has_elderly: tripParams.hasElderly,
          },
          constraints: { budget: tripParams.totalBudget },
          preferences: tripParams.preferences,
        },
        parsedParams: parsedParams && Object.keys(parsedParams).length > 0 ? parsedParams : undefined,
      };

      this.rlhfCollector.recordFeedbackSignal({
        trip_run_id: tripRunId,
        decision_point_id: `create_trip_${decisionDraftId}_${Date.now()}`,
        feedback_type: 'COMMENT',
        value: { comment: `Create trip: ${userInput.substring(0, 100)}... | steps=${decisionStepsCount}` },
        context: {
          decision_output_summary: `create_trip | draftId=${decisionDraftId} | steps=${decisionStepsCount} | destination=${tripParams.destination} | days=${tripParams.days}`,
          user_query: userInput,
          contextSnapshot: { ...contextSnapshot, createdFromNaturalLanguage: true },
        },
      });
      this.logger.debug(`[FeedbackAdapter] recordCreateTripDecisionLog: tripId=${params.tripId}, draftId=${decisionDraftId}`);
    } catch (e: unknown) {
      this.logger.warn(`[FeedbackAdapter] recordCreateTripDecisionLog 失败: ${(e as Error)?.message}`);
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

  private findLatestMetaBudgetObservationHarness(
    history?: DecisionState['history'],
  ): Record<string, unknown> | undefined {
    if (!history?.length) return undefined;
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h?.type === 'meta_budget' && h.payload && typeof h.payload === 'object') {
        const oh = (h.payload as Record<string, unknown>).observationHarness;
        if (oh && typeof oh === 'object') return oh as Record<string, unknown>;
      }
    }
    return undefined;
  }

  private buildRlhfObservationHarnessSnapshot(state: DecisionState): RlhfObservationHarnessSnapshot | undefined {
    let raw: Record<string, unknown> | undefined;
    const rd = state.research_data;
    if (rd && typeof rd === 'object' && rd.observationHarness && typeof rd.observationHarness === 'object') {
      raw = rd.observationHarness as Record<string, unknown>;
    } else {
      raw = this.findLatestMetaBudgetObservationHarness(state.history);
    }
    if (!raw) return undefined;

    const audit = Array.isArray(raw.audit) ? (raw.audit as Record<string, unknown>[]) : [];
    const evidenceKinds = [
      ...new Set(
        audit
          .map((a) => {
            const ex = a.execution as Record<string, unknown> | undefined;
            return ex?.evidenceKind as string | undefined;
          })
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    ];

    const executedActionCount = audit.filter((row) => {
      const s = (row.execution as Record<string, unknown> | undefined)?.summary;
      return s !== 'OBSERVATION_TIMEOUT' && !String(s ?? '').startsWith('EXECUTION_ERROR');
    }).length;

    const sug = raw.suggestDilemmaElicitation as Record<string, unknown> | undefined;
    const suggestDilemmaElicitation =
      sug && typeof sug === 'object'
        ? {
            reason: typeof sug.reason === 'string' ? sug.reason : 'EVIDENCE_CONTRADICTION',
            crossSpread: typeof sug.crossSpread === 'number' ? sug.crossSpread : undefined,
            hint: typeof sug.hint === 'string' ? sug.hint : undefined,
          }
        : undefined;

    const pe = raw.passabilityEvidence as Record<string, unknown> | undefined;
    const passabilityEvidence =
      pe && typeof pe === 'object'
        ? {
            passability01: typeof pe.passability01 === 'number' ? pe.passability01 : undefined,
            evidenceWeight: typeof pe.evidenceWeight === 'number' ? pe.evidenceWeight : undefined,
          }
        : undefined;

    const excl = raw.excludedPoiIds;
    const excludedPoiIdCount = Array.isArray(excl) ? excl.length : undefined;

    return {
      schemaVersion: 1,
      parallel: raw.parallel === true,
      observationTimeoutMs: typeof raw.observationTimeoutMs === 'number' ? raw.observationTimeoutMs : undefined,
      minVoiScore: typeof raw.minVoiScore === 'number' ? raw.minVoiScore : undefined,
      maxActions: typeof raw.maxActions === 'number' ? raw.maxActions : undefined,
      executedActionCount: executedActionCount > 0 ? executedActionCount : undefined,
      auditEntryCount: audit.length > 0 ? audit.length : undefined,
      excludedPoiIdCount,
      suggestDilemmaElicitation,
      passabilityEvidence,
      evidenceKinds: evidenceKinds.length ? evidenceKinds : undefined,
    };
  }

  private buildRlhfDilemmaElicitationSnapshot(state: DecisionState): RlhfDilemmaElicitationSnapshot | undefined {
    const h = state.optimizationHints?.dilemmaElicitationHint;
    if (!h || typeof h.reason !== 'string') return undefined;
    return {
      reason: h.reason,
      crossSpread: typeof h.crossSpread === 'number' ? h.crossSpread : undefined,
      hint: typeof h.hint === 'string' ? h.hint : undefined,
    };
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
