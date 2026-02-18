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

import { Injectable, Logger, Optional } from '@nestjs/common';
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
import { orchestratorStateToDecisionStatePatch } from './orchestrator-state-mapper';
import { buildWorldStateSummaryFromDso } from './world-state-summary.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type { PhaseExecutorContext } from './interfaces/phase-executor.interface';
import { ResearchExecutorService } from '../../agent/execution/research-executor.service';
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
   * 追加状态变化差分（Token 优化：只记录 Δ）
   * 用于：模型评估、自动学习、异常检测
   */
  appendHistoryDelta(state: DecisionState, delta: StateHistoryDelta, maxEntries = 50): DecisionState {
    return this.stateManager.appendHistoryDelta(state, delta, maxEntries);
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
   */
  recordUserFeedback(
    params: import('./feedback-engine-adapter.service').RecordUserFeedbackParams,
  ): Promise<void> {
    return this.feedbackAdapter.recordUserFeedback(params);
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
