/**
 * Decision Kernel Service
 *
 * Phase 2.1: Decision Kernel 中心化架构入口
 * 职责：协调 State Manager、Constraint Engine、Optimization Engine、Context Engine
 *
 * 核心原则：Kernel 是系统大脑，所有 Agent 依赖它
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import {
  DecisionState,
  DecisionStatePatch,
  StateHistoryDelta,
  ConstraintReport,
  OptimizationHints,
  StateUpdateTransaction,
  StateCommitResult,
  StateCommitConflictError,
} from './decision-state.types';
import { StateManagerService } from './state-manager.service';
import { ConstraintEngineAdapterService } from './constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { ContextEngineAdapterService, ContextPackageOverrides } from './context-engine-adapter.service';
import { FeedbackEngineAdapterService } from './feedback-engine-adapter.service';
import { inferDecisionMeta } from './decision-meta-inference';
import { orchestratorStateToDecisionStatePatch, buildHistoryDeltasFromPatch } from './orchestrator-state-mapper';
import {
  DSO_FEEDBACK_PERSISTENCE,
  type IDsoFeedbackPersistence,
} from './dso-feedback-persistence.interface';
import { REPLAN_TRIGGER, type IReplanTrigger } from './replan-trigger.interface';
import type { DecisionStateFeedback } from './decision-state.types';
import { buildWorldStateSummaryFromDso } from './world-state-summary.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';
import type { IntakeExecutorContext, NarrateExecutorContext } from './interfaces/phase-executor.interface';
import { ResearchExecutorService } from '../../agent/execution/research-executor.service';
import { IntakeExecutorService } from '../../agent/execution/intake-executor.service';
import { NarrateExecutorService } from '../../agent/execution/narrate-executor.service';
import { GateEvalExecutorService } from '../../agent/execution/gate-eval-executor.service';
import { PlanGenExecutorService } from '../../agent/execution/plan-gen-executor.service';
import { VerifyExecutorService } from '../../agent/execution/verify-executor.service';
import { RepairExecutorService } from '../../agent/execution/repair-executor.service';

@Injectable()
export class DecisionKernelService {
  private readonly logger = new Logger(DecisionKernelService.name);

  constructor(
    private readonly stateManager: StateManagerService,
    private readonly constraintAdapter: ConstraintEngineAdapterService,
    private readonly optimizationAdapter: OptimizationEngineAdapterService,
    private readonly contextAdapter: ContextEngineAdapterService,
    private readonly feedbackAdapter: FeedbackEngineAdapterService,
    @Optional() private readonly researchExecutor?: ResearchExecutorService,
    @Optional() private readonly gateEvalExecutor?: GateEvalExecutorService,
    @Optional() private readonly planGenExecutor?: PlanGenExecutorService,
    @Optional() private readonly verifyExecutor?: VerifyExecutorService,
    @Optional() private readonly repairExecutor?: RepairExecutorService,
    @Optional() private readonly intakeExecutor?: IntakeExecutorService,
    @Optional() private readonly narrateExecutor?: NarrateExecutorService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly feedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() @Inject(REPLAN_TRIGGER) private readonly replanTrigger?: IReplanTrigger,
  ) {}

  /**
   * 创建初始 DecisionState
   */
  createInitialState(requestId: string): DecisionState {
    return {
      userIntent: {},
      tripState: {},
      environmentState: {},
      systemState: {
        requestId,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        version: 0,
      },
      requestId,
    };
  }

  /**
   * 更新状态（委托 State Manager）
   */
  updateState(current: DecisionState, patch: DecisionStatePatch): DecisionState {
    return this.stateManager.merge(current, patch);
  }

  /**
   * 原子提交状态更新（专利权利要求 7）
   * STATE_UPDATE 步骤应调用此方法
   * @throws StateCommitConflictError 版本冲突时
   */
  commitStateUpdate(
    current: DecisionState,
    patch: DecisionStatePatch,
    stageOutput?: string,
  ): StateCommitResult {
    const transaction: StateUpdateTransaction = {
      requestId: current.systemState?.requestId ?? current.requestId ?? '',
      expectedVersion: current.systemState?.version ?? 0,
      patch,
      stageOutput,
    };
    return this.stateManager.commit(transaction, current);
  }

  /**
   * 带重试的原子提交（多代理并发场景）
   * 当 StateCommitConflictError 时，从 getLatestState 刷新后重试
   * 用于：WeatherAgent 等后台 Agent 与 PLAN_GEN 并发提交时的协调
   *
   * @param getLatestState 可选，返回 store 中的最新 DSO；无则只尝试一次，冲突时抛出
   * @param maxRetries 最大重试次数，默认 3
   */
  async commitStateUpdateWithRetry(
    current: DecisionState,
    patch: DecisionStatePatch,
    stageOutput?: string,
    options?: {
      getLatestState?: () => Promise<DecisionState | undefined>;
      maxRetries?: number;
    },
  ): Promise<StateCommitResult> {
    const maxRetries = options?.maxRetries ?? 3;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return this.commitStateUpdate(current, patch, stageOutput);
      } catch (err) {
        lastError = err;
        if (
          !(err instanceof StateCommitConflictError) ||
          !options?.getLatestState ||
          attempt >= maxRetries
        ) {
          throw err;
        }
        this.logger.debug(
          `[Kernel] commitStateUpdate 版本冲突 (attempt ${attempt + 1}/${maxRetries + 1})，刷新 state 后重试`,
        );
        const fresh = await options.getLatestState();
        if (!fresh) {
          throw err;
        }
        current = fresh;
      }
    }
    throw lastError;
  }

  /**
   * 分布式原子提交状态更新（P0 优化：多节点部署）
   * 使用分布式锁保护，确保跨节点状态一致性
   * @throws StateCommitConflictError 版本冲突时
   * @throws Error 锁获取失败时
   */
  async commitStateUpdateDistributed(
    current: DecisionState,
    patch: DecisionStatePatch,
    stageOutput?: string,
    options?: { useDistributedLock?: boolean; lockTtlMs?: number },
  ): Promise<StateCommitResult> {
    const transaction: StateUpdateTransaction = {
      requestId: current.systemState?.requestId ?? current.requestId ?? '',
      expectedVersion: current.systemState?.version ?? 0,
      patch,
      stageOutput,
    };
    return this.stateManager.commitWithLock(transaction, current, {
      useDistributedLock: options?.useDistributedLock ?? true,
      lockTtlMs: options?.lockTtlMs ?? 10000,
    });
  }

  /**
   * 获取 Constraint 报告（委托 Constraint Engine Adapter）
   */
  getConstraintReport(state: DecisionState): DecisionState['constraints'] {
    return this.constraintAdapter.getReport(state);
  }

  /**
   * 获取 Constraint 报告（异步，可选调用 trips ConstraintEngine）
   * 当 constraints 未设置且 planDraft 存在时，调用 isFeasible 并映射为 ConstraintReport
   */
  async getConstraintReportAsync(state: DecisionState): Promise<DecisionState['constraints']> {
    return this.constraintAdapter.getReportAsync(state);
  }

  /**
   * 获取 Optimization Hints（委托 Optimization Engine Adapter，同步）
   */
  getOptimizationHints(state: DecisionState): DecisionState['optimizationHints'] {
    return this.optimizationAdapter.getHints(state);
  }

  /**
   * 获取 Optimization Hints（异步，Scheme A: Monte Carlo 路径）
   * 当条件满足时调用 Monte Carlo 计算概率期望效用
   */
  async getOptimizationHintsAsync(state: DecisionState): Promise<DecisionState['optimizationHints']> {
    return this.optimizationAdapter.getHintsAsync(state);
  }

  /**
   * 构建 Context Package（委托 Context Engine Adapter）
   * @param overrides 来自 Conductor 的 tripId/userId/userQuery 等
   */
  async getContextPackage(
    state: DecisionState,
    overrides?: ContextPackageOverrides,
  ): Promise<DecisionState['contextPackage']> {
    return this.contextAdapter.buildContextPackage(state, overrides);
  }

  /**
   * P3 A.2: CONTEXT_BUILD 步骤封装
   * 封装 getContextPackage + DSO 更新，Conductor 调用此方法
   */
  async executeContextBuild(
    state: DecisionState,
    overrides?: ContextPackageOverrides,
  ): Promise<{ newState: DecisionState; contextPackage?: DecisionState['contextPackage'] }> {
    const pkg = await this.getContextPackage(state, overrides);
    const newState = pkg ? this.updateState(state, { contextPackage: pkg }) : state;
    return { newState, contextPackage: pkg ?? state.contextPackage };
  }

  /**
   * P3 A.3: OPTIMIZE 步骤封装
   * 封装 fatigue 合并 + getOptimizationHints + getConstraintReport
   * Conductor 预计算 TDFPM fatigue 后传入 options.fatigue
   */
  async executeOptimize(
    state: DecisionState,
    options?: { fatigue?: number },
  ): Promise<{ newState: DecisionState; optimizationHints?: OptimizationHints }> {
    let current = state;
    if (options?.fatigue !== undefined) {
      current = this.updateState(current, {
        tripState: { ...(current.tripState || {}), fatigue: options.fatigue },
      });
    }
    let hints = await this.getOptimizationHintsAsync(current);
    if (!hints) {
      hints = this.getOptimizationHints(current);
    }
    if (hints) {
      current = this.updateState(current, { optimizationHints: hints });
    }
    const planDraft = current.tripState?.planDraft;
    if (!current.constraints && planDraft) {
      try {
        const report = await this.getConstraintReportAsync(current);
        if (report) {
          current = this.updateState(current, { constraints: report });
        }
      } catch (e) {
        this.logger.warn(`[Kernel] executeOptimize getConstraintReportAsync 失败: ${(e as Error)?.message}`);
      }
    }
    return { newState: current, optimizationHints: hints };
  }

  /**
   * P3 A.4: FEEDBACK 步骤封装
   * 封装 updateState + recordDecisionLog，Conductor 构建 patch 后调用
   */
  async executeFeedback(
    current: DecisionState,
    patch: DecisionStatePatch,
  ): Promise<{ newState: DecisionState }> {
    const synced = this.updateState(current, patch);
    this.recordDecisionLog(synced, 'NARRATE_DONE').catch((e: unknown) => {
      this.logger.warn(`[Kernel] executeFeedback recordDecisionLog 失败: ${(e as Error)?.message}`);
    });
    return { newState: synced };
  }

  /**
   * 追加状态变化差分（Token 优化：只记录 Δ）
   * 用于：模型评估、自动学习、异常检测
   */
  appendHistoryDelta(state: DecisionState, delta: StateHistoryDelta, maxEntries = 50): DecisionState {
    return this.stateManager.appendHistoryDelta(state, delta, maxEntries);
  }

  /**
   * P3 A.1: STATE_UPDATE 步骤封装
   * 原子提交 + 版本冲突时回退到 merge + history delta
   * Conductor 调用此方法替代直接调用 commitStateUpdateWithRetry
   */
  async executeStateUpdate(
    current: DecisionState,
    patch: DecisionStatePatch,
    options?: {
      getLatestState?: () => Promise<DecisionState | undefined>;
      maxRetries?: number;
    },
  ): Promise<{ newState: DecisionState }> {
    try {
      const result = await this.commitStateUpdateWithRetry(current, patch, 'STATE_UPDATE', options);
      return { newState: result.newState };
    } catch (err) {
      if (err instanceof StateCommitConflictError) {
        this.logger.warn(
          `[Kernel] executeStateUpdate 版本冲突 expected=${err.expectedVersion} actual=${err.actualVersion}，回退到 merge`,
        );
        let merged = this.updateState(current, patch);
        const deltas = buildHistoryDeltasFromPatch(patch);
        for (const d of deltas) {
          merged = this.appendHistoryDelta(merged, d);
        }
        return { newState: merged };
      }
      throw err;
    }
  }

  /**
   * 设置当前决策置信度 [0,1]
   * 用于：RLHF 核心、模型评估、异常检测
   */
  setConfidence(state: DecisionState, confidence: number): DecisionState {
    const clamped = Math.max(0, Math.min(1, confidence));
    return this.stateManager.merge(state, { confidence: clamped });
  }

  /**
   * P2 逻辑下沉：Gate 评估上下文（约束 + 优化提示）
   * 白皮书 DECISION_KERNEL 6.3：Gate 业务判断迁入 Kernel
   * 供 Phase 3 策略改为「调用 Kernel 能力 + 表达输出」
   */
  async evaluateGateContext(
    state: DecisionState,
  ): Promise<{ constraints?: ConstraintReport; optimizationHints?: OptimizationHints }> {
    const [constraints, optimizationHints] = await Promise.all([
      this.getConstraintReportAsync(state),
      Promise.resolve(this.getOptimizationHints(state)),
    ]);
    this.logger.debug(
      `[evaluateGateContext] constraints=${!!constraints}, hints=${!!optimizationHints}`,
    );
    return { constraints: constraints ?? undefined, optimizationHints: optimizationHints ?? undefined };
  }

  /**
   * RESEARCH 阶段：Kernel 原生执行（KERNEL_NATIVE_EXECUTION 时使用）
   * 调用 IResearchExecutor，返回新 DSO + researchData
   */
  async executeResearch(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; researchData: Record<string, unknown> }> {
    if (!this.researchExecutor) {
      this.logger.warn('[Kernel] IResearchExecutor 未注入，无法执行 executeResearch');
      return { newState: dso, researchData: {} };
    }
    const startMs = Date.now();
    const { researchData, environmentPatch } = await this.researchExecutor.execute(dso, ctx);
    let newState = this.stateManager.merge(dso, {
      environmentState: environmentPatch,
      systemState: {
        requestId: ctx.requestId,
        currentPhase: 'RESEARCH',
        lastUpdatedAt: new Date().toISOString(),
      },
    });
    // Scheme C: 世界模型三段式显式建模，写入 worldStateSummary（P3: researchData 补全 hazardZones、demEvidence）
    const worldStateSummary = buildWorldStateSummaryFromDso(newState, researchData);
    if (Object.keys(worldStateSummary).length > 0) {
      newState = this.stateManager.merge(newState, { worldStateSummary });
    }
    this.logger.debug(
      `[Kernel] executeResearch 完成 duration_ms=${Date.now() - startMs} dataKeys=${Object.keys(researchData).length}`,
    );
    return { newState, researchData };
  }

  /**
   * GATE_EVAL 阶段：Kernel 原生执行（KERNEL_NATIVE_EXECUTION 时使用）
   */
  async executeGateEval(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; constraints: ConstraintReport; gateResult: import('./interfaces/phase-executor.interface').GateResultLike }> {
    if (!this.gateEvalExecutor) {
      this.logger.warn('[Kernel] GateEvalExecutorService 未注入，无法执行 executeGateEval');
      return {
        newState: dso,
        constraints: { feasible: true, violations: [] },
        gateResult: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 0.8 },
      };
    }
    const startMs = Date.now();
    const { constraints, gateResult } = await this.gateEvalExecutor.execute(dso, ctx);
    const newState = this.stateManager.merge(dso, {
      constraints,
      systemState: {
        requestId: ctx.requestId,
        currentPhase: 'GATE_EVAL',
        lastUpdatedAt: new Date().toISOString(),
      },
    });
    this.logger.debug(`[Kernel] executeGateEval 完成 duration_ms=${Date.now() - startMs} result=${gateResult.gate_result}`);
    return { newState, constraints, gateResult };
  }

  /**
   * PLAN_GEN 阶段：Kernel 原生执行
   */
  async executePlanGen(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; itinerary: import('./interfaces/phase-executor.interface').ItineraryLike }> {
    if (!this.planGenExecutor) {
      this.logger.warn('[Kernel] PlanGenExecutorService 未注入');
      return { newState: dso, itinerary: { request_id: ctx.requestId, days: [] } };
    }
    const { itinerary, planDraft } = await this.planGenExecutor.execute(dso, ctx);
    const newState = this.stateManager.merge(dso, {
      tripState: { planDraft },
      systemState: { requestId: ctx.requestId, currentPhase: 'PLAN_GEN', lastUpdatedAt: new Date().toISOString() },
    });
    return { newState, itinerary };
  }

  /**
   * VERIFY 阶段：Kernel 原生执行
   */
  async executeVerify(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; issues: string[]; confidenceDelta: number }> {
    if (!this.verifyExecutor) {
      return { newState: dso, issues: [], confidenceDelta: 0 };
    }
    const { issues, confidenceDelta } = await this.verifyExecutor.execute(dso, ctx);
    const newState = this.stateManager.merge(dso, {
      confidence: Math.max(0.1, (dso.confidence ?? 0.9) + confidenceDelta),
      systemState: { requestId: ctx.requestId, currentPhase: 'VERIFY', lastUpdatedAt: new Date().toISOString() },
    });
    return { newState, issues, confidenceDelta };
  }

  /**
   * REPAIR 阶段：Kernel 原生执行
   */
  async executeRepair(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; itinerary?: import('./interfaces/phase-executor.interface').ItineraryLike; repairApplied: boolean }> {
    if (!this.repairExecutor) {
      return { newState: dso, repairApplied: false };
    }
    const { itinerary, repairApplied } = await this.repairExecutor.execute(dso, ctx);
    const newState = itinerary
      ? this.stateManager.merge(dso, {
          tripState: { planDraft: itinerary },
          systemState: { requestId: ctx.requestId, currentPhase: 'REPAIR', lastUpdatedAt: new Date().toISOString() },
        })
      : dso;
    return { newState, itinerary, repairApplied };
  }

  /**
   * INTAKE 阶段：Kernel 原生执行（P3 B）
   * 封装 IIntakeExecutor，解析请求、识别缺口、生成澄清问题
   */
  async executeIntake(
    dso: DecisionState,
    ctx: IntakeExecutorContext,
  ): Promise<{
    newState: DecisionState;
    tripPlanRequest: IntakeExecutorContext['tripPlanRequest'];
    gaps: Array<{ type: import('./interfaces/phase-executor.interface').IntakeGapType; severity: 'HARD' | 'SOFT'; detail: string }>;
    clarificationQuestions: Array<{
      id: string;
      question: string;
      type: string;
      required: boolean;
      options?: unknown[];
      placeholder?: string;
      hint?: string;
      validation?: unknown;
    }>;
    intent?: string;
    candidate_structure?: { suggested_days?: number; suggested_route?: string[]; key_pois?: string[] };
  }> {
    if (!this.intakeExecutor) {
      this.logger.warn('[Kernel] IIntakeExecutor 未注入，无法执行 executeIntake');
      return {
        newState: dso,
        tripPlanRequest: ctx.tripPlanRequest ?? {},
        gaps: [],
        clarificationQuestions: [],
      };
    }
    const startMs = Date.now();
    const result = await this.intakeExecutor.execute(dso, ctx);
    // INTAKE 只更新 systemState；userIntent 由 OrchestratorState 经 orchestratorStateToDecisionStatePatch 同步
    const newState = this.stateManager.merge(dso, {
      systemState: {
        requestId: ctx.requestId,
        currentPhase: 'INTAKE',
        lastUpdatedAt: new Date().toISOString(),
      },
    });
    this.logger.debug(
      `[Kernel] executeIntake 完成 duration_ms=${Date.now() - startMs} gaps=${result.gaps.length} questions=${result.clarificationQuestions.length}`,
    );
    return {
      newState,
      tripPlanRequest: result.tripPlanRequest,
      gaps: result.gaps,
      clarificationQuestions: result.clarificationQuestions,
      intent: result.intent,
      candidate_structure: result.candidate_structure,
    };
  }

  /**
   * NARRATE 阶段：Kernel 原生执行（P3 C）
   * 封装 INarrateExecutor，产出用户可读解释（不得改硬字段）
   */
  async executeNarrate(
    dso: DecisionState,
    ctx: NarrateExecutorContext,
  ): Promise<{ narration: import('./interfaces/phase-executor.interface').NarrationLike }> {
    if (!this.narrateExecutor) {
      this.logger.warn('[Kernel] INarrateExecutor 未注入，无法执行 executeNarrate');
      return {
        narration: {
          user_friendly_summary: '',
          day_by_day_narrative: [],
          highlights: [],
          tips: [],
        },
      };
    }
    const startMs = Date.now();
    const result = await this.narrateExecutor.execute(dso, ctx);
    this.logger.debug(
      `[Kernel] executeNarrate 完成 duration_ms=${Date.now() - startMs} narrative_days=${result.narration.day_by_day_narrative?.length ?? 0}`,
    );
    return { narration: result.narration };
  }

  /**
   * 执行阶段并同步 DSO（Phase B：Conductor 只调 Kernel）
   * 执行 executeFn → 从 OrchestratorState 取 patch → 原子提交
   */
  async executePhase(
    dso: DecisionState,
    state: OrchestratorState,
    phaseName: string,
    executeFn: () => Promise<void>,
  ): Promise<DecisionState> {
    const startMs = Date.now();
    await executeFn();
    // 回调路径：executeFn 写入 state，patch 必须来自 O 以捕获新数据
    const patch = orchestratorStateToDecisionStatePatch(state);
    patch.systemState = {
      ...patch.systemState,
      requestId: state.request_id,
      currentPhase: phaseName,
      lastUpdatedAt: new Date().toISOString(),
    };
    try {
      const result = this.commitStateUpdate(dso, patch, phaseName);
      this.logger.debug(
        `[Kernel] executePhase ${phaseName} 完成 duration_ms=${Date.now() - startMs} version=${result.newVersion}`,
      );
      return result.newState;
    } catch (err) {
      if (err instanceof StateCommitConflictError) {
        this.logger.warn(
          `[Kernel] executePhase ${phaseName} 版本冲突，回退 merge duration_ms=${Date.now() - startMs}`,
        );
        return this.updateState(dso, patch);
      }
      throw err;
    }
  }

  /**
   * 记录决策日志（专利：反馈学习模块）
   * NARRATE 完成或 FEEDBACK 阶段调用
   */
  recordDecisionLog(state: DecisionState, stage: string): Promise<void> {
    return this.feedbackAdapter.recordDecisionLog(state, stage);
  }

  /**
   * 记录用户反馈（专利：反馈学习模块）
   * 供 API 层统一入口，与现有 RLHF 埋点兼容
   * 同时通过 STATE_UPDATE 将 feedback 原子写入 DSO（专利实施例 6.1.5）
   */
  async recordUserFeedback(
    params: import('./feedback-engine-adapter.service').RecordUserFeedbackParams,
  ): Promise<void> {
    await this.feedbackAdapter.recordUserFeedback(params);

    if (this.feedbackPersistence) {
      const dsoFeedback = this.mapToDecisionStateFeedback(params);
      await this.commitFeedbackToDso(params.tripRunId, dsoFeedback);
    }
  }

  /**
   * 世界模型异步推送：将 environmentState delta 通过 STATE_UPDATE 原子写入 DSO
   * 专利实施例步骤 7：WeatherAgent 等后台 Agent 与 PLAN_GEN 并发提交时的协调
   * @param sourcePhase 提交方阶段（用于 STAGE_PRIORITY，RESEARCH=2）
   */
  async pushEnvironmentDelta(
    tripRunIdOrTripId: string,
    environmentPatch: import('./decision-state.types').EnvironmentState,
    sourcePhase = 'RESEARCH',
  ): Promise<void> {
    if (!this.feedbackPersistence) return;

    try {
      const getLatest = () => this.feedbackPersistence!.getDso(tripRunIdOrTripId);
      const dso = await getLatest();
      if (!dso) return;

      const patch = {
        environmentState: environmentPatch,
        systemState: { currentPhase: sourcePhase },
      } as import('./decision-state.types').DecisionStatePatch;
      const result = await this.commitStateUpdateWithRetry(dso, patch, 'world_model_push', {
        getLatestState: getLatest,
        maxRetries: 3,
      });
      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, result.newState);
      this.logger.debug(
        `[Kernel] pushEnvironmentDelta: tripRunId=${tripRunIdOrTripId}, phase=${sourcePhase}, version ${dso.systemState?.version ?? 0}→${result.newVersion}`,
      );
      const replanCheck = this.shouldReplan(result.newState);
      if (replanCheck.needed && this.replanTrigger) {
        this.replanTrigger.triggerReplan(tripRunIdOrTripId, replanCheck.reason ?? 'environment_change').catch((e) =>
          this.logger.warn(`[Kernel] replanTrigger 失败: ${(e as Error)?.message}`),
        );
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Kernel] pushEnvironmentDelta 失败: ${(e as Error)?.message}`,
      );
    }
  }

  /**
   * 检测 DSO 是否需触发重规划（专利实施例 2：航班取消、道路封闭等）
   * 供编排层或调度器调用，返回 true 时执行 RESEARCH → PLAN_GEN → VERIFY
   */
  shouldReplan(state: DecisionState): { needed: boolean; reason?: string } {
    const env = state.environmentState ?? {};
    const flights = env.flights as Array<{ status?: string }> | undefined;
    if (Array.isArray(flights)) {
      const cancelled = flights.find((f) => (f?.status ?? '').toLowerCase() === 'cancelled');
      if (cancelled) {
        return { needed: true, reason: 'flight_cancelled' };
      }
    }
    const roads = env.roadConditions as Record<string, { status?: string }> | undefined;
    if (roads && typeof roads === 'object') {
      const closed = Object.entries(roads).find(
        ([_, v]) => (v?.status ?? '').toLowerCase() === 'closed',
      );
      if (closed) return { needed: true, reason: 'road_closed' };
    }
    return { needed: false };
  }

  /**
   * 将用户反馈通过 STATE_UPDATE 原子写入 DSO（专利实施例 6.1.5）
   */
  async commitFeedbackToDso(
    tripRunIdOrTripId: string,
    feedback: DecisionStateFeedback,
  ): Promise<void> {
    if (!this.feedbackPersistence) return;

    try {
      const dso = await this.feedbackPersistence.getDso(tripRunIdOrTripId);
      if (!dso) return;

      const patch = {
        feedback: {
          ...feedback,
          submittedAt: new Date().toISOString(),
        },
      };
      const result = this.commitStateUpdate(dso, patch, 'FEEDBACK');
      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, result.newState);
      this.logger.debug(
        `[Kernel] commitFeedbackToDso: tripRunId=${tripRunIdOrTripId}, version ${dso.systemState?.version ?? 0}→${result.newVersion}`,
      );
    } catch (e: unknown) {
      this.logger.warn(
        `[Kernel] commitFeedbackToDso 失败: ${(e as Error)?.message}`,
      );
    }
  }

  private mapToDecisionStateFeedback(
    params: import('./feedback-engine-adapter.service').RecordUserFeedbackParams,
  ): DecisionStateFeedback {
    const v = (params.value as Record<string, unknown>) ?? {};
    const sigs = (v.behaviorSignals as DecisionStateFeedback['behaviorSignals']) ?? {};
    switch (params.feedbackType) {
      case 'ACCEPT':
        return { accepted: true, behaviorSignals: { ...sigs, savePlan: true } };
      case 'REJECT':
        return {
          accepted: false,
          modifications: (params.context?.reason as string) ? [(params.context.reason as string)] : [],
        };
      case 'RATING':
        return {
          satisfactionScore: (v.rating as number) ?? 0,
          accepted: ((v.rating as number) ?? 0) >= 4,
        };
      case 'MODIFY': {
        const mod = v.modification as { field?: string; to?: unknown } | undefined;
        return {
          accepted: false,
          modifications: mod ? [`${mod.field ?? 'unknown'}: ${JSON.stringify(mod.to ?? '')}`] : [],
        };
      }
      default:
        return { accepted: (v.accepted as boolean) ?? undefined };
    }
  }

  /**
   * 从 DSO 推断并更新 DecisionMeta（Kernel 逻辑下沉）
   * 删除 Agent 后 Kernel 可独立推断 mode/phase/strategy
   */
  inferAndUpdateDecisionMeta(state: DecisionState): DecisionState {
    const meta = inferDecisionMeta({
      currentStep: state.systemState?.currentPhase,
      planVersion: state.tripState?.planVersion,
      failureRiskPredictions: state.environmentState?.failureRiskLevel
        ? [{ riskLevel: state.environmentState.failureRiskLevel }]
        : undefined,
      riskTolerance: state.userIntent?.party?.riskTolerance,
    });
    return this.stateManager.merge(state, { decisionMeta: meta });
  }
}
