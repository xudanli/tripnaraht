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
  EnvironmentState,
  StateHistoryDelta,
  ConstraintReport,
  OptimizationHints,
  StateUpdateTransaction,
  StateCommitResult,
  StateCommitConflictError,
  TripState,
  RepairEscalationPlan,
  VerificationIssue,
  VerificationReport,
  PlanGenTerminalFailure,
  type HarnessRuntimeState,
} from './decision-state.types';
import { StateManagerService } from './state-manager.service';
import { ConstraintEngineAdapterService } from './constraint-engine-adapter.service';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import { ContextEngineAdapterService, ContextPackageOverrides } from './context-engine-adapter.service';
import { FeedbackEngineAdapterService } from './feedback-engine-adapter.service';
import { inferDecisionMeta } from './decision-meta-inference';
import { buildExperienceFulfillmentFromVerificationReport } from '../../trips/experience-fulfillment/services/experience-fulfillment.orchestrator';
import { orchestratorStateToDecisionStatePatch, buildHistoryDeltasFromPatch } from './orchestrator-state-mapper';
import { MetaDecisionBudgetAllocatorService } from './meta-decision-budget-allocator.service';
import { refineBeliefWithPomdpIfAvailable } from './research-belief-pomdp-bridge';
import { shouldEmitPomdpMetricEvents, type PomdpMetricEvent } from './pomdp-metrics.event';
import { ProbabilisticWorldModelService } from '../../trips/decision/optimization/probabilistic/probabilistic-world-model.service';
import { BeliefUpdateService } from '../../trips/decision/optimization/probabilistic/belief-update.service';
import {
  DSO_FEEDBACK_PERSISTENCE,
  type IDsoFeedbackPersistence,
} from './dso-feedback-persistence.interface';
import { REPLAN_TRIGGER, type IReplanTrigger } from './replan-trigger.interface';
import type { DecisionStateFeedback } from './decision-state.types';
import {
  evaluateTravelOntologyConstraints,
  mergeOntologyViolationsIntoGateResult,
} from './travel-ontology-constraints';
import { buildWorldStateSummaryFromDso } from './world-state-summary.types';
import type { OrchestratorState } from '../../agent/interfaces/trip-plan.interface';
import type {
  PhaseExecutorContext,
  GateResultLike,
  OrchestratorAlternativesLike,
  IGateEvalExecutor,
  IntakeExecutorContext,
  NarrateExecutorContext,
} from './interfaces/phase-executor.interface';
import { ResearchPipelineService } from '../../agent/teams/research/research-pipeline.service';
import { ResearchTeamLeaderService } from '../../agent/teams/research/research-team-leader.service';
import type { ResearchTeamAuditEntry } from '../../agent/teams/research/research-team.types';
import type { ResearchConflictNegotiationReport } from '../../agent/teams/research/research-conflict-negotiation.types';
import { IntakeExecutorService } from '../../agent/execution/intake-executor.service';
import { NarrateExecutorService } from '../../agent/execution/narrate-executor.service';
import { GateEvalExecutorService } from '../../agent/execution/gate-eval-executor.service';
import { PlanGenExecutorService } from '../../agent/execution/plan-gen-executor.service';
import { VerifyExecutorService } from '../../agent/execution/verify-executor.service';
import { MemoryContextAssemblerService } from '../../agent/memory/services/memory-context-assembler.service';
import { MemoryKernelService } from '../../agent/memory/experience-replay/memory-kernel.service';
import { RepairExecutorService } from '../../agent/execution/repair-executor.service';
import { HarnessStepRunnerService } from '../../harness/runtime/harness-step-runner.service';
import { HarnessTraceFilesystemExportService } from '../../harness/tracing/harness-trace-filesystem-export.service';
import { HarnessStepName } from '../../harness/contracts/harness-step.types';
import type { HarnessStepAdmissionResult } from '../../harness/runtime/harness-step-admission.types';
import { HarnessShadowMetricsCollector } from './harness-shadow-metrics.collector';
import type {
  HarnessDecisionJustification,
  HarnessStepRunStatus,
  HarnessTraceFinalStatus,
} from '../../harness/tracing/harness-trace.types';
import { buildResearchEvidenceSnapshot } from '../../harness/lib/research-evidence-snapshot';
import { applyPendingMigrationsToPlanDraft } from './migration-injection.util';
import {
  buildDecisionFeedbackCorrelationId,
  computeRepairInterventionStateHash,
  digestPlanDraftForCorrelation,
  isUserRepairResolutionLabel,
} from './utils/decision-feedback-correlation.util';
import type { HardRuleFact } from '../../trips/decision/shared/hard-rule-snapshot.types';
import {
  attachPatentParticlesViewToEnvironment,
  mapDsoToPatentEnvironmentParticles,
} from './patent/patent-environment-particles.mapper';
import {
  buildPatentPlanCandidatePool,
  patentCandidatesToDsoField,
} from './patent/plan-gen-candidate-pool.util';
import { applyPatentFeedbackLearning } from './patent/patent-feedback-learning.util';

@Injectable()
export class DecisionKernelService {
  private readonly logger = new Logger(DecisionKernelService.name);
  private readonly strictAtomicity = process.env.DECISION_OS_ATOMIC_STRICT === '1';
  /**
   * 每阶段 commit 后追加影子 Harness（不阻断；`HARNESS_SHADOW_AFTER_PHASE=1` 开启）。
   * 产物写入 `harnessRuntime.shadow_harness_events`，供监控与 `explain.kernel_explainability`。
   *  rollout：先在 STRICT 下积累「无差」样本（如连续 100 请求），再考虑将硬门设为默认；见类型侧对指标 A/B 的注释。
   * 指标：`HarnessShadowMetricsCollector`（`HARNESS_SHADOW_METRICS_DISABLED=1` 关闭；`HARNESS_SHADOW_CONSECUTIVE_THRESHOLD` 默认 100）。
   */
  private readonly shadowHarnessAfterPhase = process.env.HARNESS_SHADOW_AFTER_PHASE === '1';
  /**
   * 影子 Harness 失败时抛错中断（`HARNESS_KERNEL_SHADOW_STRICT=1`）。用于演练硬门，不等同于生产默认拦截。
   */
  private readonly shadowHarnessStrict = process.env.HARNESS_KERNEL_SHADOW_STRICT === '1';
  private readonly commitWindowMs = Number(process.env.DECISION_OS_COMMIT_WINDOW_MS ?? 20);
  private readonly metaBudget = new MetaDecisionBudgetAllocatorService();
  private readonly failSafeMetaBudgetMinSampleSize = (() => {
    const raw = process.env.DECISION_OS_FAILSAFE_BUDGET_MIN_SAMPLE_SIZE?.trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  })();
  private readonly failSafeMetaBudgetAction: 'BLOCK' | 'ADJUST_REQUIRED' = (() => {
    const raw = (process.env.DECISION_OS_FAILSAFE_BUDGET_ACTION ?? '').trim().toUpperCase();
    return raw === 'BLOCK' ? 'BLOCK' : 'ADJUST_REQUIRED';
  })();
  private readonly pendingCommitWindows = new Map<
    string,
    {
      expectedVersion: number;
      transactions: StateUpdateTransaction[];
      timer?: NodeJS.Timeout;
      resolvers: Array<{ resolve: () => void; reject: (e: unknown) => void }>;
    }
  >();

  constructor(
    private readonly stateManager: StateManagerService,
    private readonly constraintAdapter: ConstraintEngineAdapterService,
    private readonly optimizationAdapter: OptimizationEngineAdapterService,
    private readonly contextAdapter: ContextEngineAdapterService,
    private readonly feedbackAdapter: FeedbackEngineAdapterService,
    @Optional() private readonly researchPipeline?: ResearchPipelineService,
    @Optional() private readonly gateEvalExecutor?: GateEvalExecutorService,
    @Optional() private readonly planGenExecutor?: PlanGenExecutorService,
    @Optional() private readonly verifyExecutor?: VerifyExecutorService,
    @Optional() private readonly repairExecutor?: RepairExecutorService,
    @Optional() private readonly intakeExecutor?: IntakeExecutorService,
    @Optional() private readonly narrateExecutor?: NarrateExecutorService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly feedbackPersistence?: IDsoFeedbackPersistence,
    @Optional() @Inject(REPLAN_TRIGGER) private readonly replanTrigger?: IReplanTrigger,
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelService,
    @Optional() private readonly beliefUpdate?: BeliefUpdateService,
    @Optional() private readonly harnessStepRunner?: HarnessStepRunnerService,
    @Optional() private readonly harnessTraceFilesystemExport?: HarnessTraceFilesystemExportService,
    @Optional() private readonly harnessShadowMetrics?: HarnessShadowMetricsCollector,
    @Optional() private readonly memoryContextAssembler?: MemoryContextAssemblerService,
    @Optional() private readonly researchTeamLeader?: ResearchTeamLeaderService,
    @Optional() private readonly memoryKernel?: MemoryKernelService,
  ) {}

  /**
   * 默认不向 Harness 内存 trace 追加步骤；设置 HARNESS_RECORD_TRACE=1 开启（回放/nightly）。
   */
  private shouldSkipHarnessTrace(): boolean {
    return process.env.HARNESS_RECORD_TRACE !== '1';
  }

  /**
   * 当 `HARNESS_RECORD_TRACE=1` 且本步 harness 已将失败写入 trace 时，将整条 trace 标为终态（避免 `finalStatus` 长期停在默认 DONE）。
   */
  private maybeFinalizeHarnessTraceAfterStepFailure(
    traceId: string,
    harnessStatus: HarnessStepRunStatus,
  ): void {
    if (this.shouldSkipHarnessTrace() || !this.harnessStepRunner) return;
    if (harnessStatus === 'PASSED' || harnessStatus === 'REPAIRED') return;
    const finalStatus: HarnessTraceFinalStatus =
      harnessStatus === 'BLOCKED' ? 'BLOCKED' : 'FAILED';
    this.harnessStepRunner.finalizeRecordedTrace(traceId, finalStatus);
  }

  /**
   * 编排返回前调用：在 `HARNESS_RECORD_TRACE=1` 下为仍开放的内存 trace 写入 `endedAt` 与业务终态。
   * harness 已失败收口时 trace 已闭合，本方法不会覆盖。
   */
  finalizeHarnessTraceIfRecorded(dso: DecisionState, finalStatus: HarnessTraceFinalStatus): void {
    if (this.shouldSkipHarnessTrace() || !this.harnessStepRunner) return;
    const requestId = dso.systemState?.requestId ?? dso.requestId ?? '';
    if (!requestId) return;
    const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${requestId}`;
    this.harnessStepRunner.finalizeRecordedTraceIfStillOpen(traceId, finalStatus);

    // Trace 落盘为增强能力：失败不抛错、不写 path；主请求已成功路径不受影响。
    const exportPath = this.harnessTraceFilesystemExport?.exportClosedTraceIfConfigured(traceId) ?? null;
    if (exportPath) {
      dso.harnessRuntime = {
        ...(dso.harnessRuntime ?? {}),
        traceExportRelativePath: exportPath,
      };
    }
  }

  /** 供 Harness 投影 metadata：与执行体 / grader 模型解耦（见 Harness Runtime 7.4.1）。 */
  private harnessProjectParamsFromEnv(): {
    graderModel?: string;
    executorModel?: string;
  } {
    const graderModel = process.env.HARNESS_GRADER_MODEL?.trim();
    const executorModel = process.env.HARNESS_EXECUTOR_MODEL?.trim();
    const out: { graderModel?: string; executorModel?: string } = {};
    if (graderModel) out.graderModel = graderModel;
    if (executorModel) out.executorModel = executorModel;
    return out;
  }

  /**
   * v1.0：校验当前 DSO 是否满足进入某 Harness 步骤的契约（不写 trace）。
   * 主路 Harness 说明文仍见 `kernelHarnessJustification`。
   */
  async validateStepAdmission(
    dso: DecisionState,
    step: HarnessStepName,
    extra?: { requestId?: string },
  ): Promise<HarnessStepAdmissionResult> {
    if (!this.harnessStepRunner) {
      return {
        passed: true,
        harness_step: step,
        run_status: 'PASSED',
        validation_results: [],
      };
    }
    const requestId = extra?.requestId ?? dso.systemState?.requestId ?? dso.requestId ?? 'unknown';
    const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${requestId}`;
    return this.harnessStepRunner.validateStepAdmission(dso, step, {
      traceId,
      requestId,
      ...this.harnessProjectParamsFromEnv(),
    });
  }

  private mapKernelPhaseToHarnessStep(phaseName: string): HarnessStepName | undefined {
    const m: Record<string, HarnessStepName> = {
      INTAKE: HarnessStepName.INTAKE,
      RESEARCH: HarnessStepName.RESEARCH,
      GATE_EVAL: HarnessStepName.GATE_EVAL,
      PLAN_GEN: HarnessStepName.PLAN_GEN,
      VERIFY: HarnessStepName.VERIFY,
      REPAIR: HarnessStepName.REPAIR,
      NARRATE: HarnessStepName.NARRATE,
    };
    return m[phaseName];
  }

  private async applyShadowHarnessPostPhase(
    dso: DecisionState,
    phaseName: string,
    requestId: string,
  ): Promise<DecisionState> {
    if (!this.shadowHarnessAfterPhase || !this.harnessStepRunner) {
      return dso;
    }
    const harnessStep = this.mapKernelPhaseToHarnessStep(phaseName);
    if (!harnessStep) {
      return dso;
    }
    const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${requestId}`;
    const out = await this.harnessStepRunner.runStep(
      harnessStep,
      dso,
      { traceId, requestId, ...this.harnessProjectParamsFromEnv() },
      {
        skipTrace: true,
        decisionJustification: this.kernelHarnessJustification(harnessStep, requestId),
      },
    );
    const passed = out.status === 'PASSED' || out.status === 'REPAIRED';
    if (!passed && this.shadowHarnessStrict) {
      throw new Error(
        `HARNESS_KERNEL_SHADOW_STRICT: shadow harness failed phase=${phaseName} step=${String(harnessStep)} status=${out.status}`,
      );
    }

    this.harnessShadowMetrics?.recordShadowCheck({
      kernel_phase: phaseName,
      harness_step: String(harnessStep),
      status: out.status,
      validation_results: out.validationResults,
      grader_results: out.graderResults,
      request_id: requestId,
    });

    const failedCodes = out.validationResults.filter((v) => !v.passed).map((v) => v.code);
    const event = {
      kernel_phase: phaseName,
      harness_step: String(harnessStep),
      run_status: out.status,
      shadow_enforcement: true as const,
      harness_warning: passed
        ? undefined
        : `[SHADOW_HARNESS] 阶段 ${phaseName} 提交后复验 Harness(${String(harnessStep)})=${out.status}；主链未阻断。失败码: ${failedCodes.join(',') || 'n/a'}`,
      validation_results: out.validationResults.map((v) => ({
        passed: v.passed,
        code: v.code,
        message: v.message,
        severity: v.severity,
      })),
      recorded_at: new Date().toISOString(),
    };
    const prev = dso.harnessRuntime?.shadow_harness_events ?? [];
    return this.stateManager.merge(dso, {
      harnessRuntime: {
        ...(dso.harnessRuntime ?? {}),
        shadow_harness_events: [...prev, event],
      },
    });
  }

  /** Kernel 在调用 Harness 确定性门禁时附带的简短因果说明（供 trace / 奖励抽取锚点）。 */
  private kernelHarnessJustification(step: HarnessStepName, requestId: string): HarnessDecisionJustification {
    const createdAt = new Date().toISOString();
    return {
      summary: `DecisionKernel: run deterministic harness validators for ${String(step)} before phase executor (requestId=${requestId}).`,
      createdAt,
    };
  }

  /**
   * 创建初始 DecisionState
   * @param opts.evaluationRunId — 与 Evaluation Harness `runFingerprint.runId` / `route_and_run.meta.run_id` 对齐，供 Harness trace 关联
   * @param opts.replanLineage — PRD I3：与 `OrchestratorState.metadata.replan_context` 对齐，写入 harnessRuntime
   * @param opts.orchestratorPlanVersion — 与 `OrchestratorState.plan_version` 对齐，写入 tripState.planVersion
   */
  createInitialState(
    requestId: string,
    opts?: {
      evaluationRunId?: string;
      replanLineage?: {
        previous_plan_version?: number;
        previous_world_snapshot_hash?: string;
      };
      orchestratorPlanVersion?: number;
    },
  ): DecisionState {
    const base: DecisionState = {
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
    const harnessRuntime: HarnessRuntimeState = {};
    const runId = opts?.evaluationRunId?.trim();
    if (runId) {
      harnessRuntime.evaluationRunId = runId;
    }
    if (opts?.replanLineage) {
      const rl = opts.replanLineage;
      if (rl.previous_plan_version !== undefined && Number.isFinite(rl.previous_plan_version)) {
        harnessRuntime.replan_previous_plan_version = Number(rl.previous_plan_version);
      }
      const h =
        typeof rl.previous_world_snapshot_hash === 'string' ? rl.previous_world_snapshot_hash.trim() : '';
      if (h) {
        harnessRuntime.replan_previous_world_snapshot_hash = h;
      }
    }
    const nextTrip = {
      ...base.tripState,
      ...(opts?.orchestratorPlanVersion !== undefined && Number.isFinite(opts.orchestratorPlanVersion)
        ? { planVersion: opts.orchestratorPlanVersion }
        : {}),
    };
    const hasTripDelta = nextTrip.planVersion !== undefined;
    const hasHarness = Object.keys(harnessRuntime).length > 0;
    if (!hasHarness && !hasTripDelta) {
      return base;
    }
    return {
      ...base,
      ...(hasHarness ? { harnessRuntime } : {}),
      ...(hasTripDelta ? { tripState: nextTrip } : {}),
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
      const effectiveUncertainty = hints.uncertaintyProfile ?? current.uncertaintyProfile;
      const suggestedSampleSize = effectiveUncertainty?.suggestedSampleSize ?? undefined;
      const isMetaBudgetBelowMinimum =
        effectiveUncertainty?.hasUncertainty === true &&
        typeof suggestedSampleSize === 'number' &&
        suggestedSampleSize <= this.failSafeMetaBudgetMinSampleSize;
      if (isMetaBudgetBelowMinimum) {
        hints = {
          ...hints,
          failSafeAction: hints.failSafeAction ?? this.failSafeMetaBudgetAction,
          failSafeReason:
            hints.failSafeReason ??
            (this.failSafeMetaBudgetMinSampleSize > 0
              ? `META_BUDGET_BELOW_MIN(sample<=${this.failSafeMetaBudgetMinSampleSize})`
              : 'META_BUDGET_EXHAUSTED'),
        };
      }
      current = this.updateState(current, { optimizationHints: hints });

      // 专利证据：把优化阶段的元决策预算审计写入 DSO.history（可追溯审计）
      if (hints.metaDecisionAudit || hints.failSafeAction) {
        const audit =
          hints.metaDecisionAudit ??
          (hints.failSafeAction ? `fail_safe=${hints.failSafeAction};reason=${hints.failSafeReason ?? 'n/a'}` : '');
        current = this.appendHistoryDelta(current, {
          type: 'meta_budget',
          summary: `OPTIMIZE_${hints.method ?? 'UNKNOWN'}:${audit}`,
          at: new Date().toISOString(),
          payload: {
            phase: 'OPTIMIZE',
            method: hints.method,
            metaDecisionAudit: hints.metaDecisionAudit,
            failSafeAction: hints.failSafeAction,
            failSafeReason: hints.failSafeReason,
            rolloutHorizonSteps: hints.rolloutHorizonSteps,
            uncertaintyProfile: hints.uncertaintyProfile ?? current.uncertaintyProfile,
            candidateSearchBudget: hints.candidateSearchBudget,
            candidateSearchAudit: hints.candidateSearchAudit,
          },
        });
      }
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
    let synced = this.updateState(current, patch);
    const { patch: learnPatch, historyDelta } = applyPatentFeedbackLearning(synced);
    if (Object.keys(learnPatch).length > 0) {
      synced = this.updateState(synced, learnPatch);
    }
    if (historyDelta) {
      synced = this.appendHistoryDelta(synced, historyDelta);
    }
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
        if (this.strictAtomicity) {
          // 专利口径：冲突不可“合并兜底”，应回滚/退出同步阶段
          throw err;
        }
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
  ): Promise<{
    newState: DecisionState;
    researchData: Record<string, unknown>;
    teamAuditLog?: ResearchTeamAuditEntry[];
    conflictNegotiation?: ResearchConflictNegotiationReport;
  }> {
    if (!this.researchPipeline) {
      this.logger.warn('[Kernel] IResearchExecutor 未注入，无法执行 executeResearch');
      return { newState: dso, researchData: {} };
    }
    const harnessTraceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
    if (this.harnessStepRunner) {
      const pre = await this.harnessStepRunner.runStep(
        HarnessStepName.RESEARCH,
        dso,
        {
          traceId: harnessTraceId,
          requestId: ctx.requestId,
          idempotencyKey: `research:${ctx.requestId}`,
          ...this.harnessProjectParamsFromEnv(),
        },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.RESEARCH, ctx.requestId),
        },
      );
      if (pre.status !== 'PASSED') {
        this.logger.warn(
          `[Kernel] Harness RESEARCH 预检未通过: status=${pre.status} codes=${pre.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        this.maybeFinalizeHarnessTraceAfterStepFailure(harnessTraceId, pre.status);
        return { newState: dso, researchData: {} };
      }
    }
    const startMs = Date.now();
    let researchData: Record<string, unknown>;
    let environmentPatch: Partial<EnvironmentState>;
    let teamAuditLog: ResearchTeamAuditEntry[] | undefined;
    let conflictNegotiation: ResearchConflictNegotiationReport | undefined;
    let execCtx = ctx;
    if (this.memoryKernel && !ctx.userCognitiveProfile) {
      const subject = ctx.userId?.trim() || ctx.requestId?.trim();
      if (subject) {
        const profile = await this.memoryKernel.loadProfileForSubject(subject);
        if (profile) execCtx = { ...ctx, userCognitiveProfile: profile };
      }
    }
    if (this.researchTeamLeader) {
      const team = await this.researchTeamLeader.run(dso, execCtx);
      researchData = team.researchData;
      environmentPatch = team.environmentPatch;
      teamAuditLog = team.teamAuditLog;
      conflictNegotiation = team.conflictNegotiation;
    } else {
      const out = await this.researchPipeline.execute(dso, execCtx);
      researchData = out.researchData;
      environmentPatch = out.environmentPatch;
    }
    const useAtomicResearch = process.env.DECISION_OS_RESEARCH_ATOMIC === '1';
    const historyDeltas: StateHistoryDelta[] = [];
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

    // 专利证据链（最小闭环）：RESEARCH 写入 uncertaintyProfile + beliefSamples
    // - uncertaintyProfile: entropy/ESS/建议采样数/rolloutTopK/planningDepth（元决策预算入口）
    // - beliefSamples: 离散粒子近似（非均匀权重，可审计）
    const budgetDraft = this.metaBudget.deriveUncertaintyBudget(newState);
    if (!budgetDraft.hasUncertainty) {
      // no-op
    } else {
      // 先用 proxy 信号决定初始粒子数（随后 finalize 可能因 ESS 退化上调 sampleSize）
      const seedN =
        budgetDraft.proxyEntropy01 >= 0.85
          ? 240
          : budgetDraft.proxyEntropy01 >= 0.6
            ? 160
            : budgetDraft.proxyEntropy01 >= 0.3
              ? 80
              : 40;

      let beliefSamples = this.metaBudget.buildBeliefSamples(newState, seedN, budgetDraft.proxyEntropy01);
      let uncertaintyProfile = this.metaBudget.finalizeUncertaintyProfile(budgetDraft, beliefSamples);

      // 若 finalize 因 ESS 退化上调了 sampleSize，则重建粒子集以与预算一致（最多 2 次，避免震荡）
      for (let i = 0; i < 2; i++) {
        const targetN = uncertaintyProfile.suggestedSampleSize ?? beliefSamples.length;
        if (!targetN || targetN === beliefSamples.length) break;
        beliefSamples = this.metaBudget.buildBeliefSamples(newState, targetN, budgetDraft.proxyEntropy01);
        uncertaintyProfile = this.metaBudget.finalizeUncertaintyProfile(budgetDraft, beliefSamples);
      }

      let beliefRefinement: 'META_ALLOCATOR' | 'POMDP' = 'META_ALLOCATOR';
      const entropy01Before = uncertaintyProfile.entropy01;
      const essBefore = uncertaintyProfile.effectiveParticleCount;
      const rd = researchData as Record<string, unknown>;
      const pomdpRefinement = await refineBeliefWithPomdpIfAvailable({
        dso: newState,
        researchData: rd,
        beliefSamples,
        probabilisticWorldModel: this.probabilisticWorldModel,
        beliefUpdate: this.beliefUpdate,
      });
      if (pomdpRefinement?.refinementEffective) {
        beliefSamples = pomdpRefinement.refinedSamples;
        uncertaintyProfile = this.metaBudget.finalizeUncertaintyProfile(budgetDraft, beliefSamples);
        beliefRefinement = 'POMDP';
      }

      newState = this.stateManager.merge(newState, {
        uncertaintyProfile,
        beliefSamples,
      });

      if (process.env.DECISION_OS_PATENT_PARTICLES_VIEW === '1') {
        const patentView = mapDsoToPatentEnvironmentParticles(newState);
        newState = this.stateManager.merge(newState, {
          environmentState: attachPatentParticlesViewToEnvironment(
            newState.environmentState ?? {},
            patentView,
          ),
        });
      }

      // 专利证据：把元决策预算写入 DSO.history（可追溯审计）
      const metaBudgetDelta: StateHistoryDelta = {
        type: 'meta_budget',
        summary: `RESEARCH_META_BUDGET(sample=${uncertaintyProfile.suggestedSampleSize ?? 0},topK=${uncertaintyProfile.rolloutTopK ?? 'n/a'},H=${uncertaintyProfile.planningDepth ?? 'n/a'},beta=${uncertaintyProfile.explorationBeta ?? 'n/a'},entropy=${(uncertaintyProfile.entropy01 ?? 0).toFixed(3)},ESS=${(uncertaintyProfile.effectiveParticleCount ?? 0).toFixed(1)})`,
        at: new Date().toISOString(),
        payload: {
          phase: 'RESEARCH',
          uncertaintyProfile,
          beliefSampleCount: beliefSamples.length,
          beliefRefinement,
          pomdp:
            beliefRefinement === 'POMDP'
              ? {
                  logNormalizationConstant: pomdpRefinement?.logNormalizationConstant,
                  effectiveParticleCount: pomdpRefinement?.pomdpEffectiveParticleCount,
                  observationProvenance: pomdpRefinement?.observationProvenance,
                  observedWindSpeedMs: pomdpRefinement?.observedWindSpeedMs,
                  observationQuality: pomdpRefinement?.observationQuality,
                  observationIndependence:
                    pomdpRefinement?.observationProvenance === 'derived_from_weather_risk_scalar' ? 'WEAK' : 'STRONG',
                  // 过渡期：旧字段仍写入，但不再走旧推断逻辑，统一以 v2 为准
                  observationIndependenceTier: pomdpRefinement?.observationIndependenceTier,
                  windSpeedMeta: pomdpRefinement?.windSpeedMeta,
                  entropy01Before,
                  entropy01After: uncertaintyProfile.entropy01,
                  essBefore,
                  essAfter: uncertaintyProfile.effectiveParticleCount,
                  deltaEntropy01:
                    typeof entropy01Before === 'number' && typeof uncertaintyProfile.entropy01 === 'number'
                      ? uncertaintyProfile.entropy01 - entropy01Before
                      : undefined,
                  deltaEss:
                    typeof essBefore === 'number' && typeof uncertaintyProfile.effectiveParticleCount === 'number'
                      ? uncertaintyProfile.effectiveParticleCount - essBefore
                      : undefined,
                  weightL1Delta: pomdpRefinement?.weightL1Delta,
                  weightJSDivergence: pomdpRefinement?.weightJSDivergence,
                  refinementThresholds: pomdpRefinement?.refinementThresholds,
                  observationsUsed: pomdpRefinement?.observationsUsed,
                  beliefUpdateSteps: pomdpRefinement?.beliefUpdateSteps,
                  observationFusionOrder: pomdpRefinement?.observationFusionOrder,
                  observationModelParams: pomdpRefinement?.observationModelParams,
                }
              : undefined,
        },
      };
      historyDeltas.push(metaBudgetDelta);
      newState = this.appendHistoryDelta(newState, metaBudgetDelta);

      // 可观测性：输出 POMDP 精炼指标事件（JSON log；默认关闭）
      if (shouldEmitPomdpMetricEvents()) {
        const env = (newState.environmentState ?? {}) as Record<string, unknown>;
        const pomdp = pomdpRefinement as any;
        const event: PomdpMetricEvent = {
          type: beliefRefinement === 'POMDP' ? 'POMDP_REFINEMENT_APPLIED' : 'POMDP_REFINEMENT_SKIPPED',
          at: new Date().toISOString(),
          requestId: ctx.requestId,
          countryCode: typeof env.countryCode === 'string' ? env.countryCode : undefined,
          month: typeof env.month === 'number' ? env.month : undefined,
          beliefRefinement,
          refinementEffective: pomdp?.refinementEffective,
          observationIndependenceTier: pomdp?.observationIndependenceTier,
          observationQuality: pomdp?.observationQuality,
          observationFusionOrder: pomdp?.observationFusionOrder,
          observationsUsedCount: Array.isArray(pomdp?.observationsUsed) ? pomdp.observationsUsed.length : undefined,
          deltaEntropy01:
            typeof entropy01Before === 'number' && typeof uncertaintyProfile.entropy01 === 'number'
              ? uncertaintyProfile.entropy01 - entropy01Before
              : undefined,
          deltaEss:
            typeof essBefore === 'number' && typeof uncertaintyProfile.effectiveParticleCount === 'number'
              ? uncertaintyProfile.effectiveParticleCount - essBefore
              : undefined,
          weightL1Delta: pomdp?.weightL1Delta,
          weightJSDivergence: pomdp?.weightJSDivergence,
          refinementThresholds: pomdp?.refinementThresholds,
          windSpeedMetaSource: pomdp?.windSpeedMeta?.source,
          windSpeedEvidenceCount: Array.isArray(pomdp?.windSpeedMeta?.evidence?.ids)
            ? pomdp.windSpeedMeta.evidence.ids.length
            : undefined,
          windSpeedEvidenceSources: Array.isArray(pomdp?.windSpeedMeta?.evidence?.sources)
            ? pomdp.windSpeedMeta.evidence.sources
            : undefined,
          observationModelParams: pomdp?.observationModelParams,
          skipReason:
            beliefRefinement === 'POMDP'
              ? undefined
              : pomdpRefinement
                ? 'below_threshold_or_no_change'
                : 'unavailable',
        };
        this.logger.log(`[POMDP_METRIC] ${JSON.stringify(event)}`);
      }
    }

    const evidenceSnap = buildResearchEvidenceSnapshot(ctx.requestId, researchData);
    newState = this.stateManager.merge(newState, {
      harnessRuntime: {
        ...newState.harnessRuntime,
        researchEvidenceSnapshotId: evidenceSnap.researchEvidenceSnapshotId,
        evidenceVersion: evidenceSnap.evidenceVersion,
        activeTraceId: harnessTraceId,
      },
    });

    if (useAtomicResearch) {
      // 原子提交：一次性写入关键字段（environment/system/world/belief/uncertainty/history）
      // 注意：这里直接提交 newState 的差分字段，避免中间 merge 多次持久化导致不一致窗口。
      const patch: DecisionStatePatch = {
        environmentState: newState.environmentState,
        systemState: newState.systemState,
        worldStateSummary: newState.worldStateSummary,
        uncertaintyProfile: newState.uncertaintyProfile,
        beliefSamples: newState.beliefSamples,
        harnessRuntime: newState.harnessRuntime,
        // 重要：patch.history 只能写“增量”，否则 mergeHistory 会重复追加导致 history 膨胀
        history: historyDeltas.length > 0 ? historyDeltas : undefined,
      };
      // 若存在持久化层：以 store 的 latest 为基准，commit + persist 做带重试的乐观并发写入
      // - commit 的冲突检测只覆盖“本地对象版本不匹配”，真正并发冲突通常体现在 persist(expectedVersion) 失败
      if (this.feedbackPersistence) {
        const key = newState.travelOntologyState?.tripId ?? ctx.requestId;
        const maxRetries = 3;
        const prevErrors: string[] = [];
        let lastErr: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          const latest = (await this.feedbackPersistence.getDso(key)) ?? dso;
          const expectedVersion = latest.systemState?.version ?? 0;
          try {
            // 可审计证据：把“发生过冲突并重试”写入 history（最终成功的那次会落库）
            const arbitrationDelta: StateHistoryDelta = {
              type: 'kernel_arbitration',
              at: new Date().toISOString(),
              summary: `research_atomic_persist(attempt=${attempt + 1}/${maxRetries + 1})`,
              payload: {
                status: 'ATTEMPT',
                merge_strategy: 'OPTIMISTIC_LOCK',
                conflict_detected: prevErrors.length > 0,
                conflict_resolution: prevErrors.length > 0 ? 'RETRY' : 'NONE',
                attempt: attempt + 1,
                max_attempts: maxRetries + 1,
                retry_count: prevErrors.length,
                dso_version_before: expectedVersion,
                previous_errors: prevErrors.slice(-3),
              },
            };

            const patchWithAudit: DecisionStatePatch = {
              ...patch,
              history: [...(historyDeltas.length > 0 ? historyDeltas : []), arbitrationDelta],
            };
            const result = this.commitStateUpdate(latest, patchWithAudit, 'RESEARCH');
            await this.feedbackPersistence.persistDso(key, result.newState, { expectedVersion });
            newState = result.newState;
            lastErr = undefined;
            break;
          } catch (e: unknown) {
            lastErr = e;
            prevErrors.push((e as Error)?.message ?? String(e));
            if (attempt >= maxRetries) break;
          }
        }
        if (lastErr) {
          this.logger.warn(
            `[Kernel] executeResearch 原子落库多次失败 key=${key} err=${(lastErr as Error)?.message}`,
          );
        }
      } else {
        const result = this.commitStateUpdate(dso, patch, 'RESEARCH');
        newState = result.newState;
      }
    }

    this.logger.debug(
      `[Kernel] executeResearch 完成 duration_ms=${Date.now() - startMs} dataKeys=${Object.keys(researchData).length}`,
    );
    return { newState, researchData, teamAuditLog, conflictNegotiation };
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
    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const harnessGate = await this.harnessStepRunner.runStep(
        HarnessStepName.GATE_EVAL,
        dso,
        { traceId, requestId: ctx.requestId, ...this.harnessProjectParamsFromEnv() },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.GATE_EVAL, ctx.requestId),
        },
      );
      if (harnessGate.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessGate.status);
        const detail =
          harnessGate.failureEvents?.map((e) => e.message).join('; ') ??
          harnessGate.validationResults.filter((r) => !r.passed).map((r) => r.message).join('; ') ??
          harnessGate.status;
        this.logger.warn(
          `[Kernel] Harness GATE_EVAL 硬阻断: status=${harnessGate.status} codes=${harnessGate.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        const blockedConstraints: ConstraintReport = {
          feasible: false,
          violations: [
            {
              type: 'HARNESS_GATE',
              severity: 'HARD',
              detail: `Harness GATE_EVAL: ${detail}`,
            },
          ],
          gateOutcome: 'BLOCK',
        };
        const blockedGate: GateResultLike = {
          gate_result: 'BLOCK',
          violations: blockedConstraints.violations as GateResultLike['violations'],
          required_adjustments: [],
          confidence: 0,
        };
        const blockedState = this.stateManager.merge(dso, {
          constraints: blockedConstraints,
          tripState: {
            orchestratorAlternatives: { alternative_pois: [], alternative_routes: [] },
          },
          systemState: {
            requestId: ctx.requestId,
            currentPhase: 'GATE_EVAL',
            lastUpdatedAt: new Date().toISOString(),
          },
        });
        return { newState: blockedState, constraints: blockedConstraints, gateResult: blockedGate };
      }
    }
    const gateEvalOutcome = (await this.gateEvalExecutor.execute(dso, ctx)) as Awaited<
      ReturnType<IGateEvalExecutor['execute']>
    >;
    let { constraints, gateResult } = gateEvalOutcome;
    const { alternatives } = gateEvalOutcome;

    // Kernel fail-safe: 将元决策预算不足信号收口到 Gate 结果（避免“表面 ALLOW，但预算已耗尽”继续推进）
    // - 仅在执行器返回 ALLOW 时才降级（不覆盖更严格的结果）
    // - BLOCK → HARD violation
    // - ADJUST_REQUIRED → SOFT violation + required_adjustments
    const fsAction = dso.optimizationHints?.failSafeAction;
    if (fsAction && gateResult.gate_result === 'ALLOW') {
      const reason = dso.optimizationHints?.failSafeReason ?? 'n/a';
      const severity: 'HARD' | 'SOFT' = fsAction === 'BLOCK' ? 'HARD' : 'SOFT';
      const violation: { type: string; severity: 'HARD' | 'SOFT'; detail: string } = {
        type: 'META_BUDGET',
        severity,
        detail: `fail-safe(${fsAction}): ${reason}`,
      };
      gateResult = {
        ...gateResult,
        gate_result: fsAction,
        violations: [...(gateResult.violations ?? []), violation],
        required_adjustments:
          fsAction === 'ADJUST_REQUIRED'
            ? [
                ...(gateResult.required_adjustments ?? []),
                { action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: `meta budget too low (${reason})` },
              ]
            : [...(gateResult.required_adjustments ?? [])],
      };
      constraints = {
        ...constraints,
        feasible: false,
        violations: [...(constraints.violations ?? []), violation],
        gateOutcome: fsAction,
      };
    }

    const ontologyViolations = evaluateTravelOntologyConstraints(dso);
    if (ontologyViolations.length > 0) {
      const merged = mergeOntologyViolationsIntoGateResult(constraints, gateResult, ontologyViolations);
      constraints = merged.constraints;
      gateResult = merged.gateResult;
      this.logger.debug(
        `[Kernel] travelOntology constraints merged: +${ontologyViolations.length} violation(s), gate=${gateResult.gate_result}`,
      );
    }
    const tripStatePatch: Partial<TripState> =
      gateResult.gate_result === 'BLOCK'
        ? { orchestratorAlternatives: normalizeBlockAlternativesForDso(gateResult, alternatives) }
        : { orchestratorAlternatives: undefined };
    const newState = this.stateManager.merge(dso, {
      constraints,
      tripState: tripStatePatch,
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
    const emptyItin = (): import('./interfaces/phase-executor.interface').ItineraryLike => ({
      request_id: ctx.requestId,
      days: [],
    });

    const grb = dso.harnessRuntime?.governance_runtime_branch_v1;
    if (grb?.branchType === 'replanning') {
      const failure: PlanGenTerminalFailure = {
        code: 'GOVERNANCE_REPLANNING_DEFERRED',
        message:
          'Governance runtime 要求重规划：已跳过常规 itinerary 生成，请按 replanningIntent 收敛走廊/载具后再扩线。',
        detail: grb.replanningIntent?.trigger,
      };
      return {
        newState: this.stateManager.merge(dso, {
          tripState: { planDraft: emptyItin() },
          systemState: {
            requestId: ctx.requestId,
            currentPhase: 'PLAN_GEN',
            planGenTerminalFailure: failure,
          } as any,
        }),
        itinerary: emptyItin(),
      };
    }

    if (!this.planGenExecutor) {
      this.logger.warn('[Kernel] PlanGenExecutorService 未注入');
      const failure: PlanGenTerminalFailure = {
        code: 'PLAN_GEN_EXECUTOR_UNAVAILABLE',
        message: 'PlanGen 执行器未注入，无法生成日程。',
      };
      return {
        newState: this.stateManager.merge(dso, {
          tripState: { planDraft: emptyItin() },
          systemState: {
            requestId: ctx.requestId,
            currentPhase: 'PLAN_GEN',
            planGenTerminalFailure: failure,
          } as any,
        }),
        itinerary: emptyItin(),
      };
    }
    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const harnessOutcome = await this.harnessStepRunner.runStep(
        HarnessStepName.PLAN_GEN,
        dso,
        {
          traceId,
          requestId: ctx.requestId,
          idempotencyKey: `plan-gen:${ctx.requestId}`,
          ...this.harnessProjectParamsFromEnv(),
        },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.PLAN_GEN, ctx.requestId),
        },
      );
      if (harnessOutcome.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessOutcome.status);
        this.logger.warn(
          `[Kernel] Harness PLAN_GEN 未通过: status=${harnessOutcome.status} codes=${harnessOutcome.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        const detail = harnessOutcome.failureEvents?.map((e) => e.code).join(',') || undefined;
        const failure: PlanGenTerminalFailure = {
          code: 'PLAN_GEN_HARNESS_BLOCKED',
          message: '行程生成准入（Harness）未通过，未调用生成器。',
          detail,
        };
        return {
          newState: this.stateManager.merge(dso, {
            tripState: { planDraft: emptyItin() },
            systemState: {
              requestId: ctx.requestId,
              currentPhase: 'PLAN_GEN',
              planGenTerminalFailure: failure,
            } as any,
          }),
          itinerary: emptyItin(),
        };
      }
    }
    const execResult = await this.planGenExecutor.execute(dso, ctx);
    let finalItinerary = execResult.itinerary as import('./interfaces/phase-executor.interface').ItineraryLike;
    const pend = dso.systemState?.pendingMigrations ?? [];
    let pendingRem = pend;
    if (pend.length > 0 && Array.isArray((finalItinerary as any).days) && (finalItinerary as any).days.length > 0) {
      const { itinerary: merged, appliedIds } = applyPendingMigrationsToPlanDraft(finalItinerary, pend);
      if (appliedIds.length > 0) {
        finalItinerary = merged;
        pendingRem = pend.filter((m) => !appliedIds.includes(m.id));
      }
    }
    const dayCount = Array.isArray((finalItinerary as any).days) ? (finalItinerary as any).days.length : 0;
    const sysPatch: Record<string, unknown> = {
      requestId: ctx.requestId,
      currentPhase: 'PLAN_GEN',
      lastUpdatedAt: new Date().toISOString(),
    };
    if (pend.length > 0) {
      (sysPatch as any).pendingMigrations = pendingRem.length > 0 ? pendingRem : [];
    }
    if (dayCount === 0) {
      const fromExec = execResult.emptyDraftExplanation;
      (sysPatch as any).planGenTerminalFailure = {
        code: fromExec?.code ?? 'PLAN_GEN_EMPTY_DRAFT',
        message: fromExec?.message ?? '未能生成任何日程天。',
        detail: fromExec?.detail,
      } satisfies PlanGenTerminalFailure;
    } else {
      (sysPatch as any).planGenTerminalFailure = undefined;
    }
    let newState = this.stateManager.merge(dso, {
      tripState: { planDraft: finalItinerary },
      systemState: sysPatch as any,
    });
    if (process.env.DECISION_OS_PATENT_PLAN_GEN_CANDIDATES === '1' && dayCount > 0) {
      const pool = buildPatentPlanCandidatePool(newState, finalItinerary, {
        topK: newState.uncertaintyProfile?.rolloutTopK ?? 2,
        explorationBeta: newState.uncertaintyProfile?.explorationBeta ?? 0.4,
      });
      newState = this.stateManager.merge(newState, {
        candidates: patentCandidatesToDsoField(pool),
      });
    }
    return { newState, itinerary: finalItinerary };
  }

  /**
   * PRE_PLAN_MIGRATION_INJECTION：在已有 planDraft（断点续跑/局部重算）上先消费 pendingMigrations，再进入 itinerary.generate。
   * 全量首次规划时 planDraft 常为空，由 executePlanGen 末尾对生成结果再合并迁移。
   */
  applyPrePlanMigrationInjections(dso: DecisionState): DecisionState {
    const pend = dso.systemState?.pendingMigrations ?? [];
    const draft = dso.tripState?.planDraft as import('./interfaces/phase-executor.interface').ItineraryLike | undefined;
    if (!pend.length || !draft?.days?.length) return dso;
    const { itinerary, appliedIds } = applyPendingMigrationsToPlanDraft(draft, pend);
    const remaining = pend.filter((m) => !appliedIds.includes(m.id));
    return this.stateManager.merge(dso, {
      tripState: { planDraft: itinerary },
      systemState: {
        requestId: dso.systemState.requestId,
        pendingMigrations: remaining.length > 0 ? remaining : [],
        lastUpdatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * VERIFY 阶段：Kernel 原生执行
   */
  async executeVerify(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ newState: DecisionState; issues: import('./decision-state.types').VerificationIssue[]; confidenceDelta: number }> {
    if (!this.verifyExecutor) {
      return { newState: dso, issues: [], confidenceDelta: 0 };
    }

    // Kernel fail-safe: 元决策预算不足时，VERIFY 直接给出高优先级 issue。
    // 目的：让 verify/repair loop 在没有足够预算/证据时走“收缩范围/补证据”，避免无意义的深链路执行。
    const fsAction = dso.optimizationHints?.failSafeAction;
    if (fsAction) {
      const reason = dso.optimizationHints?.failSafeReason ?? 'n/a';
      const issue: import('./decision-state.types').VerificationIssue = {
        code: 'UNKNOWN',
        class: fsAction === 'BLOCK' ? 'FATAL' : 'CONFLICT',
        message: `META_BUDGET_FAIL_SAFE(${fsAction}): ${reason}`,
        source: 'OTHER',
        at: new Date().toISOString(),
        suggestedActions: fsAction === 'BLOCK' ? [{ action: 'BLOCK' }] : [{ action: 'ASK_USER' }],
      };
      const confidenceDelta = fsAction === 'BLOCK' ? -0.2 : -0.1;
      const verifiedAt = new Date().toISOString();
      const report: import('./decision-state.types').VerificationReport = {
        issues: [issue],
        hasFatal: issue.class === 'FATAL',
        hasConflict: issue.class === 'CONFLICT',
        hasAdvisory: issue.class === 'ADVISORY',
        counts: {
          fatal: issue.class === 'FATAL' ? 1 : 0,
          conflict: issue.class === 'CONFLICT' ? 1 : 0,
          advisory: issue.class === 'ADVISORY' ? 1 : 0,
        },
        verifiedAt,
      };
      const newState = this.stateManager.merge(dso, {
        confidence: Math.max(0.1, (dso.confidence ?? 0.9) + confidenceDelta),
        verification: report,
        systemState: { requestId: ctx.requestId, currentPhase: 'VERIFY', lastUpdatedAt: new Date().toISOString() },
      });
      return { newState, issues: [issue], confidenceDelta };
    }

    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const harnessOutcome = await this.harnessStepRunner.runStep(
        HarnessStepName.VERIFY,
        dso,
        { traceId, requestId: ctx.requestId, ...this.harnessProjectParamsFromEnv() },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.VERIFY, ctx.requestId),
        },
      );
      if (harnessOutcome.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessOutcome.status);
        const valMsgs = harnessOutcome.validationResults
          .filter((r) => !r.passed)
          .map((r) => r.message);
        const graderMsgs =
          harnessOutcome.graderResults?.filter((g) => !g.passed).map((g) => g.explanation) ?? [];
        const msgs = [...valMsgs, ...graderMsgs];
        this.logger.warn(
          `[Kernel] Harness VERIFY 未通过: status=${harnessOutcome.status} codes=${harnessOutcome.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        const verifiedAt = new Date().toISOString();
        const issues: import('./decision-state.types').VerificationIssue[] = (msgs.length > 0 ? msgs : ['harness_verify_failed']).map(
          (m) => ({
            code: 'UNKNOWN',
            class: 'CONFLICT',
            message: String(m),
            source: 'HARNESS',
            at: verifiedAt,
            suggestedActions: [{ action: 'ASK_USER' }],
          }),
        );
        const report: import('./decision-state.types').VerificationReport = {
          issues,
          hasFatal: false,
          hasConflict: issues.length > 0,
          hasAdvisory: false,
          counts: { fatal: 0, conflict: issues.length, advisory: 0 },
          verifiedAt,
        };
        return {
          newState: this.stateManager.merge(dso, {
            verification: report,
            systemState: { requestId: ctx.requestId, currentPhase: 'VERIFY', lastUpdatedAt: new Date().toISOString() },
          }),
          issues,
          confidenceDelta: 0,
        };
      }
    }
    const baseVersion = dso.systemState?.version ?? 0;
    // 进入 VERIFY 临界区：加锁（不 commit，仅在返回的新 DSO 中携带；上层若持久化需尊重 stageLock）
    const locked = this.stateManager.merge(dso, {
      systemState: {
        requestId: ctx.requestId,
        stageLock: {
          locked: true,
          owner: 'VERIFY_REPAIR',
          lockedAt: new Date().toISOString(),
          baseVersion,
          allowedStages: ['VERIFY', 'REPAIR'],
        },
      },
    });

    const { issues, confidenceDelta } = await this.verifyExecutor.execute(locked, ctx);
    const verifiedAt = new Date().toISOString();
    const counts = {
      fatal: issues.filter((i) => i.class === 'FATAL').length,
      conflict: issues.filter((i) => i.class === 'CONFLICT').length,
      advisory: issues.filter((i) => i.class === 'ADVISORY').length,
    };
    const report: import('./decision-state.types').VerificationReport = {
      issues,
      hasFatal: counts.fatal > 0,
      hasConflict: counts.conflict > 0,
      hasAdvisory: counts.advisory > 0,
      counts,
      verifiedAt,
      assertions_triggered: this.deriveVerifyTriggeredAssertions(issues, locked, verifiedAt),
    };
    const userMessage = String(
      (locked.userIntent as { message?: string })?.message ??
        ctx.tripPlanRequest?.message ??
        '',
    ).trim();
    const experienceFulfillment = buildExperienceFulfillmentFromVerificationReport(report, {
      userMessage,
      scope: 'TRIP',
      verificationRunId: `vr-kernel-${verifiedAt}`,
    });
    const newState = this.stateManager.merge(locked, {
      confidence: Math.max(0.1, (dso.confidence ?? 0.9) + confidenceDelta),
      verification: report,
      experienceFulfillment,
      systemState: { requestId: ctx.requestId, currentPhase: 'VERIFY', lastUpdatedAt: new Date().toISOString() },
    });
    this.refreshOperationalNegativeOverlayAfterVerifyPhase();
    return { newState, issues, confidenceDelta };
  }

  /**
   * VERIFY 结束：将 Decision ring 负向约束同步进 ExecutionContext（与 append 内 refresh 对齐，供 Planning 前 Context 稳定）。
   */
  private refreshOperationalNegativeOverlayAfterVerifyPhase(): void {
    try {
      this.memoryContextAssembler?.refreshOperationalNegativeExecutionOverlay();
    } catch (e: any) {
      this.logger.debug(
        `[Kernel] refreshOperationalNegativeExecutionOverlay after VERIFY skipped: ${e?.message ?? e}`,
      );
    }
  }

  /**
   * 从 VERIFY 结果提炼可审计 HardRuleFact（当前聚焦 SUNSET_BREACH → solar_safety_v1）。
   */
  private deriveVerifyTriggeredAssertions(
    issues: VerificationIssue[],
    dso: DecisionState,
    at: string,
  ): HardRuleFact[] {
    const out: HardRuleFact[] = [];
    for (const it of issues ?? []) {
      if (it.code !== 'SUNSET_BREACH') continue;
      const day = String(it.entityRef?.id ?? '').slice(0, 10);
      const daylight =
        day && dso.environmentState?.daylightByDate && typeof dso.environmentState.daylightByDate === 'object'
          ? dso.environmentState.daylightByDate[day]
          : undefined;
      const sunsetOrDusk = daylight?.civil_dusk ?? daylight?.sunset;
      const tw = Number((dso.environmentState as any)?.twilightBufferMin);
      out.push({
        rule_id: 'solar_safety_v1',
        rule_name: 'Sunset visibility window breached',
        actual_value: day || null,
        threshold: typeof sunsetOrDusk === 'string' ? sunsetOrDusk : null,
        unit: 'date',
        is_violated: true,
        severity: 'HARD',
        evidence: {
          type: 'solar_safety',
          day,
          sunset_or_civil_dusk: sunsetOrDusk,
          ...(Number.isFinite(tw) ? { twilight_buffer_min: Math.round(tw) } : {}),
          source: 'VERIFY/SUNSET_BREACH',
          message: it.message,
        },
        at,
      });
    }
    return out;
  }

  /**
   * 合并 REPAIR 产出的 escalation / advisory 到 verification（保留既有 issues）。
   */
  private buildVerificationAfterRepair(
    dso: DecisionState,
    params: { escalationPlan?: RepairEscalationPlan; postRepairAdvisories?: VerificationIssue[] },
  ): VerificationReport | undefined {
    const { escalationPlan, postRepairAdvisories = [] } = params;
    if (!escalationPlan && postRepairAdvisories.length === 0) return undefined;
    const cur = dso.verification;
    const base: VerificationReport =
      cur ?? {
        issues: [],
        hasFatal: false,
        hasConflict: false,
        hasAdvisory: false,
        counts: { fatal: 0, conflict: 0, advisory: 0 },
        verifiedAt: new Date().toISOString(),
      };
    const newIssues = [...base.issues, ...postRepairAdvisories];
    const counts = {
      fatal: newIssues.filter((i) => i.class === 'FATAL').length,
      conflict: newIssues.filter((i) => i.class === 'CONFLICT').length,
      advisory: newIssues.filter((i) => i.class === 'ADVISORY').length,
    };
    return {
      ...base,
      issues: newIssues,
      counts,
      hasFatal: counts.fatal > 0,
      hasConflict: counts.conflict > 0,
      hasAdvisory: counts.advisory > 0,
      escalationPlan: escalationPlan ?? base.escalationPlan,
      verifiedAt: base.verifiedAt,
    };
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

    // Kernel fail-safe: 若预算已触发 BLOCK，则不进入 REPAIR（避免在“应阻断”的状态下产生误导性修复）。
    if (dso.optimizationHints?.failSafeAction === 'BLOCK') {
      const newState = this.stateManager.merge(dso, {
        systemState: { requestId: ctx.requestId, currentPhase: 'REPAIR', lastUpdatedAt: new Date().toISOString() },
      });
      return { newState, repairApplied: false };
    }

    // Kernel fail-safe: ADJUST_REQUIRED 时，把“收缩范围/补证据”显式注入到 repair ctx，让 repair executor 可直接消费。
    const fsAction = dso.optimizationHints?.failSafeAction;
    if (fsAction === 'ADJUST_REQUIRED') {
      const reason = dso.optimizationHints?.failSafeReason ?? 'n/a';
      const gate = ctx.gateResult;
      const existing = gate?.required_adjustments ?? [];
      const hasDirective = existing.some((a) => a.action === 'REDUCE_SCOPE_OR_ADD_EVIDENCE');
      ctx = {
        ...ctx,
        gateResult: {
          gate_result: gate?.gate_result ?? 'ADJUST_REQUIRED',
          confidence: gate?.confidence ?? 0.5,
          violations: gate?.violations ?? [],
          required_adjustments: hasDirective
            ? existing
            : [...existing, { action: 'REDUCE_SCOPE_OR_ADD_EVIDENCE', why: `meta budget too low (${reason})` }],
        },
      };
    }

    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const dsoVersion = dso.systemState?.version ?? 0;
      const harnessRepair = await this.harnessStepRunner.runStep(
        HarnessStepName.REPAIR,
        dso,
        {
          traceId,
          requestId: ctx.requestId,
          idempotencyKey: `repair:${ctx.requestId}:v${dsoVersion}`,
          ...this.harnessProjectParamsFromEnv(),
        },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.REPAIR, ctx.requestId),
        },
      );
      if (harnessRepair.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessRepair.status);
        this.logger.warn(
          `[Kernel] Harness REPAIR 未通过: status=${harnessRepair.status} codes=${harnessRepair.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        return { newState: dso, repairApplied: false };
      }
    }
    // REPAIR 处于临界区末端：执行完成后释放锁（若存在）
    let itinerary: import('./interfaces/phase-executor.interface').ItineraryLike | undefined;
    let repairApplied = false;
    let repairPostAdvisories: VerificationIssue[] = [];
    let repairEscalationPlan: RepairEscalationPlan | undefined;
    let repairTraces: any[] = [];
    const mergedPendingMigrations = [...(dso.systemState?.pendingMigrations ?? [])];
    let repairRecoverySignal: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION' | undefined =
      dso.systemState?.recoverySignal as 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION' | undefined;
    const hadPendingAtStart = (dso.systemState?.pendingMigrations?.length ?? 0) > 0;
    try {
      const out = await this.repairExecutor.execute(dso, ctx);
      itinerary = out.itinerary;
      repairApplied = out.repairApplied;
      repairPostAdvisories = out.postRepairAdvisories ?? [];
      repairEscalationPlan = out.escalationPlan;
      repairTraces = (out as any).repairTraces ?? [];
      if (out.pendingMigrations?.length) mergedPendingMigrations.push(...out.pendingMigrations);
      if (out.recoverySignal) repairRecoverySignal = out.recoverySignal;
    } catch (e: any) {
      const msg = String(e?.message ?? '');
      // Repair 内部的局部效用/原则保护：将其提升为结构化 FATAL verification
      if (msg.startsWith('FATAL_REPAIR_GUARD:')) {
        const detail = msg.replace(/^FATAL_REPAIR_GUARD:\s*/, '').trim() || 'fatal repair guard';
        const verifiedAt = new Date().toISOString();
        const issue: import('./decision-state.types').VerificationIssue = {
          code: 'UNKNOWN',
          class: 'FATAL',
          message: detail,
          source: 'OTHER',
          at: verifiedAt,
          suggestedActions: [{ action: 'ASK_USER', detail: 'repair violated core preference/anchor; needs confirmation' }],
        };
        const report: import('./decision-state.types').VerificationReport = {
          issues: [issue],
          hasFatal: true,
          hasConflict: false,
          hasAdvisory: false,
          counts: { fatal: 1, conflict: 0, advisory: 0 },
          verifiedAt,
        };
        const newState = this.stateManager.merge(dso, {
          verification: report,
          systemState: {
            requestId: ctx.requestId,
            currentPhase: 'REPAIR',
            lastUpdatedAt: new Date().toISOString(),
            stageLock: dso.systemState?.stageLock?.owner === 'VERIFY_REPAIR'
              ? { ...dso.systemState.stageLock, locked: false }
              : dso.systemState?.stageLock,
          },
        });
        return { newState, itinerary: ctx.itinerary, repairApplied: false };
      }
      throw e;
    }
    // repairCount：每次跑完 RepairExecutor（含仅写入 escalationPlan、tripState 未变）均 +1，与「修复生命周期」对齐。
    const prevCount = dso.systemState?.repairCount ?? 0;
    const nextCount = prevCount + 1;
    let migrationAbsorptionFailures = dso.systemState?.migrationAbsorptionFailures ?? 0;
    if (hadPendingAtStart && repairEscalationPlan) {
      migrationAbsorptionFailures += 1;
    } else if (!repairEscalationPlan) {
      migrationAbsorptionFailures = 0;
    }
    if (migrationAbsorptionFailures >= 2 && repairEscalationPlan) {
      repairRecoverySignal = 'NEED_USER_INTERVENTION';
      const tag = '[迁移吸收]';
      if (!repairPostAdvisories.some((a) => (a.message ?? '').includes(tag))) {
        repairPostAdvisories.push({
          code: 'ROUTE_INFEASIBLE',
          class: 'CONFLICT',
          message: `${tag} 跨日注入后仍无法在相邻日内自动收敛；请缩小范围、改期或手动调整锚点/日照敏感节点。`,
          source: 'OTHER',
          at: new Date().toISOString(),
          suggestedActions: [{ action: 'ASK_USER', detail: 'migrationAbsorptionFailures>=2' }],
        });
      }
    }
    const prevHist = dso.systemState?.repairTraceHistory ?? [];
    const incoming = Array.isArray(repairTraces) ? repairTraces : [];
    const repairTraceHistory = [...prevHist, ...incoming].slice(-120);

    if (repairEscalationPlan && !repairEscalationPlan.correlationId) {
      const utilitySum = incoming.reduce((s, t: any) => s + (Number(t?.metrics?.utility_delta) || 0), 0);
      const planForDigest = itinerary ?? ctx.itinerary ?? dso.tripState?.planDraft;
      const planDigest = digestPlanDraftForCorrelation(planForDigest);
      const stateHash = computeRepairInterventionStateHash({
        dsoVersion: dso.systemState?.version ?? 0,
        escalationReason: repairEscalationPlan.reason,
        utilityDeltaSum: utilitySum,
        planDigest,
      });
      const sessionId = String(ctx.requestId || dso.requestId || '');
      const correlationId = buildDecisionFeedbackCorrelationId({
        sessionId,
        phase: 'REPAIR',
        kind: 'REPAIR_ESCALATION',
        roundIndex: nextCount,
        stateHash,
      });
      repairEscalationPlan = { ...repairEscalationPlan, correlationId };
    }

    const baseSystemPatch = {
      requestId: ctx.requestId,
      currentPhase: 'REPAIR',
      lastUpdatedAt: new Date().toISOString(),
      repairCount: nextCount,
      stageLock: dso.systemState?.stageLock?.owner === 'VERIFY_REPAIR'
        ? { ...dso.systemState.stageLock, locked: false }
        : dso.systemState?.stageLock,
      migrationAbsorptionFailures,
      repairTraceHistory,
      ...(mergedPendingMigrations.length > 0 ? { pendingMigrations: mergedPendingMigrations } : {}),
      ...(repairRecoverySignal ? { recoverySignal: repairRecoverySignal } : {}),
      ...(Array.isArray(repairTraces) && repairTraces.length > 0 ? { repairTraces } : {}),
    };
    const confDelta = repairPostAdvisories.reduce((s, i) => s + (i.metadata?.confidence_impact ?? 0), 0);
    const verificationPatch = this.buildVerificationAfterRepair(dso, {
      escalationPlan: repairEscalationPlan,
      postRepairAdvisories: repairPostAdvisories,
    });
    const mergePatch: DecisionStatePatch = {
      systemState: baseSystemPatch,
      ...(itinerary ? { tripState: { planDraft: itinerary } } : {}),
      ...(verificationPatch ? { verification: verificationPatch } : {}),
      ...(confDelta !== 0 ? { confidence: Math.max(0.1, (dso.confidence ?? 0.9) + confDelta) } : {}),
    };
    const newState = this.stateManager.merge(dso, mergePatch);
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
    simulation?: { simulatedRepairTraces: import('../../agent/services/route-feasibility.types').SimulatedRepairTrace[] };
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
    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const harnessIntake = await this.harnessStepRunner.runStep(
        HarnessStepName.INTAKE,
        dso,
        {
          traceId,
          requestId: ctx.requestId,
          idempotencyKey: `intake:${ctx.requestId}`,
          ...this.harnessProjectParamsFromEnv(),
        },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.INTAKE, ctx.requestId),
        },
      );
      if (harnessIntake.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessIntake.status);
        this.logger.warn(
          `[Kernel] Harness INTAKE 未通过: status=${harnessIntake.status} codes=${harnessIntake.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        return {
          newState: dso,
          tripPlanRequest: ctx.tripPlanRequest ?? {},
          gaps: [],
          clarificationQuestions: [],
        };
      }
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
      ...(result.simulation ? { simulation: result.simulation } : {}),
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
    if (this.harnessStepRunner) {
      const traceId = dso.harnessRuntime?.activeTraceId ?? `harness-${ctx.requestId}`;
      const harnessNarrate = await this.harnessStepRunner.runStep(
        HarnessStepName.NARRATE,
        dso,
        {
          traceId,
          requestId: ctx.requestId,
          idempotencyKey: `narrate:${ctx.requestId}`,
          ...this.harnessProjectParamsFromEnv(),
        },
        {
          skipTrace: this.shouldSkipHarnessTrace(),
          decisionJustification: this.kernelHarnessJustification(HarnessStepName.NARRATE, ctx.requestId),
        },
      );
      if (harnessNarrate.status !== 'PASSED') {
        this.maybeFinalizeHarnessTraceAfterStepFailure(traceId, harnessNarrate.status);
        this.logger.warn(
          `[Kernel] Harness NARRATE 未通过: status=${harnessNarrate.status} codes=${harnessNarrate.failureEvents?.map((e) => e.code).join(',') ?? 'n/a'}`,
        );
        return {
          narration: {
            user_friendly_summary: '',
            day_by_day_narrative: [],
            highlights: [],
            tips: [],
          },
        };
      }
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
    const harnessCursor = this.mapKernelPhaseToHarnessStep(phaseName);
    patch.systemState = {
      ...patch.systemState,
      requestId: state.request_id,
      currentPhase: phaseName,
      lastUpdatedAt: new Date().toISOString(),
      ...(harnessCursor ? { cursorStep: harnessCursor } : {}),
    };
    try {
      const result = this.commitStateUpdate(dso, patch, phaseName);
      this.logger.debug(
        `[Kernel] executePhase ${phaseName} 完成 duration_ms=${Date.now() - startMs} version=${result.newVersion}`,
      );
      return await this.applyShadowHarnessPostPhase(result.newState, phaseName, state.request_id);
    } catch (err) {
      if (err instanceof StateCommitConflictError) {
        if (this.strictAtomicity) {
          throw err;
        }
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
   * 澄清按钮回传：将 `user_repair_resolution` 与 `correlationId` 写入 DSO（及 RLHF 信号），供离线 join。
   * - `feedbackPhase: INTAKE`：先知卡（PREDICTIVE_FAILURE）指纹；`REPAIR`：效用补偿 / REPAIR 升级（默认）。
   */
  async recordUserRepairResolution(params: {
    tripRunId: string;
    correlationId: string;
    resolution: import('./decision-state.types').UserRepairResolutionLabel;
    userId?: string;
    feedbackPhase?: import('./decision-state.types').UserRepairResolutionFeedbackPhase;
  }): Promise<{ ok: boolean; deduped?: boolean; persisted?: boolean }> {
    if (!isUserRepairResolutionLabel(params.resolution)) {
      this.logger.warn(`[Kernel] recordUserRepairResolution: invalid resolution=${params.resolution}`);
      return { ok: false };
    }
    const uid = params.userId ?? '';
    const feedbackPhase = params.feedbackPhase ?? 'REPAIR';
    if (!this.feedbackPersistence) {
      this.logger.debug('[Kernel] recordUserRepairResolution: 无 DSO 持久化，仅写 RLHF 信号');
      await this.feedbackAdapter.recordUserRepairResolutionSignal({
        tripRunId: params.tripRunId,
        userId: uid,
        correlationId: params.correlationId,
        resolution: params.resolution,
        feedbackPhase,
      });
      return { ok: true, persisted: false };
    }

    const dso = await this.feedbackPersistence.getDso(params.tripRunId);
    if (!dso) {
      await this.feedbackAdapter.recordUserRepairResolutionSignal({
        tripRunId: params.tripRunId,
        userId: uid,
        correlationId: params.correlationId,
        resolution: params.resolution,
        feedbackPhase,
      });
      return { ok: true, persisted: false };
    }

    const prev = dso.systemState?.userRepairResolutionLog ?? [];
    if (prev.some((e) => e.correlationId === params.correlationId)) {
      return { ok: true, deduped: true, persisted: true };
    }

    const recordedAt = new Date().toISOString();
    const entry: import('./decision-state.types').UserRepairResolutionEvent = {
      correlationId: params.correlationId,
      resolution: params.resolution,
      recordedAt,
      feedbackPhase,
    };
    const historyDelta: import('./decision-state.types').StateHistoryDelta = {
      type: 'user_repair_resolution',
      summary: `user_repair_resolution=${params.resolution} phase=${feedbackPhase}`,
      at: recordedAt,
      meta: {
        correlation_id: params.correlationId,
        user_repair_resolution: params.resolution,
        feedback_phase: feedbackPhase,
        request_id: dso.systemState?.requestId ?? dso.requestId,
        version: dso.systemState?.version,
      },
    };

    const newState = this.stateManager.merge(dso, {
      systemState: {
        requestId: dso.systemState?.requestId ?? dso.requestId,
        userRepairResolutionLog: [...prev, entry].slice(-50),
      },
      history: [historyDelta],
    });

    await this.feedbackPersistence.persistDso(params.tripRunId, newState);
    await this.feedbackAdapter.recordUserRepairResolutionSignal({
      tripRunId: params.tripRunId,
      userId: uid,
      correlationId: params.correlationId,
      resolution: params.resolution,
      feedbackPhase,
    });
    return { ok: true, persisted: true };
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
    return this.pushDelta(
      tripRunIdOrTripId,
      {
        environmentState: environmentPatch,
        systemState: { currentPhase: sourcePhase },
      } as import('./decision-state.types').DecisionStatePatch,
      'world_model_push',
      sourcePhase,
    );
  }

  /**
   * 通用异步 delta 推送：通过 commit-window 聚合多条无冲突增量，形成一次 commitBatch
   * 适用：世界模型推送、计划生成侧写入、并发代理 patch 等
   */
  async pushDelta(
    tripRunIdOrTripId: string,
    patch: import('./decision-state.types').DecisionStatePatch,
    stageOutput: string,
    sourcePhase?: string,
  ): Promise<void> {
    if (!this.feedbackPersistence) return;

    const getLatest = () => this.feedbackPersistence!.getDso(tripRunIdOrTripId);
    const dso = await getLatest();
    if (!dso) return;

    const expectedVersion = dso.systemState?.version ?? 0;
    const tx: StateUpdateTransaction = {
      requestId: dso.systemState?.requestId ?? dso.requestId ?? tripRunIdOrTripId,
      expectedVersion,
      patch,
      stageOutput,
    };

    try {
      await this.enqueueCommitWindow(tripRunIdOrTripId, expectedVersion, tx);

      const latest = await getLatest();
      if (latest) {
        const replanCheck = this.shouldReplan(latest);
        if (replanCheck.needed && this.replanTrigger) {
          this.replanTrigger.triggerReplan(tripRunIdOrTripId, replanCheck.reason ?? 'environment_change').catch((e) =>
            this.logger.warn(`[Kernel] replanTrigger 失败: ${(e as Error)?.message}`),
          );
        }
      }
    } catch (e: unknown) {
      this.logger.warn(
        `[Kernel] pushDelta 失败: stage=${stageOutput} phase=${sourcePhase ?? ''} err=${(e as Error)?.message}`,
      );
    }
  }

  private enqueueCommitWindow(
    tripRunIdOrTripId: string,
    expectedVersion: number,
    tx: StateUpdateTransaction,
  ): Promise<void> {
    const existing = this.pendingCommitWindows.get(tripRunIdOrTripId);
    if (existing && existing.expectedVersion === expectedVersion) {
      existing.transactions.push(tx);
      return new Promise<void>((resolve, reject) => {
        existing.resolvers.push({ resolve, reject });
      });
    }

    // 若存在不同版本窗口，立即冲刷旧窗口（避免堆积）
    if (existing && existing.timer) {
      clearTimeout(existing.timer);
      existing.timer = undefined;
      this.flushCommitWindow(tripRunIdOrTripId, existing).catch(() => undefined);
    }

    const window = {
      expectedVersion,
      transactions: [tx],
      resolvers: [] as Array<{ resolve: () => void; reject: (e: unknown) => void }>,
      timer: undefined as NodeJS.Timeout | undefined,
    };
    this.pendingCommitWindows.set(tripRunIdOrTripId, window);

    const p = new Promise<void>((resolve, reject) => {
      window.resolvers.push({ resolve, reject });
    });

    window.timer = setTimeout(() => {
      this.flushCommitWindow(tripRunIdOrTripId, window).catch((e) => {
        // 统一失败通知
        for (const r of window.resolvers) r.reject(e);
      });
    }, Math.max(0, this.commitWindowMs));

    return p;
  }

  private async flushCommitWindow(
    tripRunIdOrTripId: string,
    window: {
      expectedVersion: number;
      transactions: StateUpdateTransaction[];
      timer?: NodeJS.Timeout;
      resolvers: Array<{ resolve: () => void; reject: (e: unknown) => void }>;
    },
  ): Promise<void> {
    if (!this.feedbackPersistence) return;
    this.pendingCommitWindows.delete(tripRunIdOrTripId);
    if (window.timer) clearTimeout(window.timer);

    const getLatest = () => this.feedbackPersistence!.getDso(tripRunIdOrTripId);
    const dso = await getLatest();
    if (!dso) {
      for (const r of window.resolvers) r.resolve();
      return;
    }

    // 若版本已变化，退化为逐条 optimistic commit（仍保证正确性）
    if ((dso.systemState?.version ?? 0) !== window.expectedVersion) {
      for (const tx of window.transactions) {
        const latestBefore = await getLatest();
        if (!latestBefore) continue;
        const beforeVersion = latestBefore.systemState?.version ?? 0;
        try {
          const result = await this.commitStateUpdateWithRetry(
            latestBefore,
            tx.patch,
            tx.stageOutput,
            { getLatestState: getLatest, maxRetries: 3 },
          );
          const touched = this.computeTouchedPathsUnion([tx]);
          const stages = Array.from(new Set([(tx.stageOutput ?? '').toString()].filter(Boolean)));
          const nextState = this.appendHistoryDelta(
            result.newState,
            {
              type: 'kernel_arbitration',
              at: new Date().toISOString(),
              summary: `commit_single(${tx.stageOutput ?? 'unknown'})`,
              payload: {
                status: 'SUCCESS',
                merge_strategy: 'OPTIMISTIC_LOCK',
                conflict_detected: false,
                dso_version_before: beforeVersion,
                dso_version_after: result.newVersion,
                tx_count: 1,
                stages,
                touched_paths: touched,
              },
            },
            100,
          );
          await this.feedbackPersistence.persistDso(tripRunIdOrTripId, nextState, {
            expectedVersion: beforeVersion,
          });
        } catch (e: unknown) {
          // 逐条提交失败：写入 abort 审计（不推进版本）
          const touched = this.computeTouchedPathsUnion([tx]);
          const stages = Array.from(new Set([(tx.stageOutput ?? '').toString()].filter(Boolean)));
          const conflictState = this.appendHistoryDelta(
            latestBefore,
            {
              type: 'kernel_arbitration',
              at: new Date().toISOString(),
              summary: `commit_single_conflict(${tx.stageOutput ?? 'unknown'})`,
              payload: {
                status: 'FAILED',
                merge_strategy: 'OPTIMISTIC_LOCK',
                conflict_detected: true,
                conflict_resolution: 'ABORT',
                dso_version_before: beforeVersion,
                dso_version_after: beforeVersion,
                tx_count: 1,
                stages,
                touched_paths: touched,
                error: (e as Error)?.message,
              },
            },
            100,
          );
          await this.feedbackPersistence.persistDso(tripRunIdOrTripId, conflictState, {
            expectedVersion: beforeVersion,
          });
        }
      }
      for (const r of window.resolvers) r.resolve();
      return;
    }

    const touchedPaths = this.computeTouchedPathsUnion(window.transactions);
    const stages = Array.from(
      new Set(window.transactions.map((t) => (t.stageOutput ?? '').toString()).filter(Boolean)),
    );

    try {
      // 使用 batch commit：一次 version++，一次 persist
      const batchResult = this.stateManager.commitBatch(window.transactions, dso);

      const isRolledBack = batchResult.rolledBack === true;
      const nextState = this.appendHistoryDelta(
        batchResult.newState,
        {
          type: 'kernel_arbitration',
          at: new Date().toISOString(),
          summary: isRolledBack ? `commit_batch_rollback(${window.transactions.length})` : `commit_batch(${window.transactions.length})`,
          payload: {
            status: isRolledBack ? 'ROLLED_BACK' : 'SUCCESS',
            merge_strategy: 'COMMIT_BATCH',
            conflict_detected: false,
            conflict_resolution: isRolledBack ? 'ROLLBACK' : undefined,
            dso_version_before: window.expectedVersion,
            dso_version_after: isRolledBack ? window.expectedVersion : batchResult.newVersion,
            attempted_new_version: window.expectedVersion + 1,
            tx_count: window.transactions.length,
            stages,
            touched_paths: touchedPaths,
          },
        },
        100,
      );
      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, nextState, {
        expectedVersion: window.expectedVersion,
      });

      for (const r of window.resolvers) r.resolve();
    } catch (e: unknown) {
      // 字段冲突 / 阶段不合法 / 其他错误：按专利口径 abort，并写入可追溯审计记录（不推进版本）
      const conflictState = this.appendHistoryDelta(
        dso,
        {
          type: 'kernel_arbitration',
          at: new Date().toISOString(),
          summary: `commit_batch_conflict(${window.transactions.length})`,
          payload: {
            status: 'FAILED',
            merge_strategy: 'COMMIT_BATCH',
            conflict_detected: true,
            conflict_resolution: 'ABORT',
            dso_version_before: window.expectedVersion,
            dso_version_after: window.expectedVersion,
            tx_count: window.transactions.length,
            stages,
            touched_paths: touchedPaths,
            error: (e as Error)?.message,
          },
        },
        100,
      );
      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, conflictState, {
        expectedVersion: window.expectedVersion,
      });

      // delta push 语义：不向上抛错（避免后台 agent 风暴）；仍完成 promise
      for (const r of window.resolvers) r.resolve();
    }
  }

  private computeTouchedPathsUnion(transactions: StateUpdateTransaction[]): string[] {
    const out = new Set<string>();
    const walk = (obj: any, base: string) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        if (base) out.add(base);
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        const next = base ? `${base}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (base) out.add(next);
          walk(v, next);
        } else {
          out.add(next);
        }
      }
    };
    for (const tx of transactions) {
      walk(tx.patch as any, '');
    }
    return Array.from(out).sort();
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
      const nextState = this.appendHistoryDelta(
        result.newState,
        {
          type: 'kernel_arbitration',
          at: new Date().toISOString(),
          summary: 'feedback state commit',
          payload: {
            status: 'SUCCESS',
            merge_strategy: 'OPTIMISTIC_LOCK',
            conflict_detected: false,
            dso_version_before: dso.systemState?.version,
            dso_version_after: result.newVersion,
          },
        },
        100,
      );
      await this.feedbackPersistence.persistDso(tripRunIdOrTripId, nextState, {
        expectedVersion: dso.systemState?.version,
      });
      this.logger.debug(
        `[Kernel] commitFeedbackToDso: tripRunId=${tripRunIdOrTripId}, version ${dso.systemState?.version ?? 0}→${result.newVersion}`,
      );
    } catch (e: unknown) {
      if (e instanceof StateCommitConflictError) {
        this.logger.warn(
          `[Kernel] commitFeedbackToDso 版本冲突: expected=${e.expectedVersion} actual=${e.actualVersion}`,
        );
        try {
          const latest = await this.feedbackPersistence.getDso(tripRunIdOrTripId);
          if (latest) {
            const conflictState = this.appendHistoryDelta(
              latest,
              {
                type: 'kernel_arbitration',
                at: new Date().toISOString(),
                summary: 'feedback state commit conflict',
                payload: {
                  status: 'FAILED',
                  merge_strategy: 'OPTIMISTIC_LOCK',
                  conflict_detected: true,
                  conflict_resolution: 'ABORT',
                  dso_version_before: e.expectedVersion,
                  dso_version_after: e.actualVersion,
                },
              },
              100,
            );
            await this.feedbackPersistence.persistDso(tripRunIdOrTripId, conflictState, {
              expectedVersion: latest.systemState?.version,
            });
          }
        } catch {
          // 冲突审计写入失败不影响主流程
        }
        return;
      }
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
    const context = params.context as Record<string, unknown> | undefined;
    switch (params.feedbackType) {
      case 'ACCEPT':
        return { accepted: true, behaviorSignals: { ...sigs, savePlan: true } };
      case 'REJECT':
        return {
          accepted: false,
          modifications: typeof context?.reason === 'string' && context.reason.length > 0 ? [context.reason] : [],
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

function countOrchestratorAlternativeEntries(alternatives?: OrchestratorAlternativesLike): number {
  if (!alternatives) return 0;
  const pois = Array.isArray(alternatives.alternative_pois) ? alternatives.alternative_pois.length : 0;
  const routes = Array.isArray(alternatives.alternative_routes) ? alternatives.alternative_routes.length : 0;
  return pois + routes;
}

/** BLOCK 时写入 DSO：执行器非空 alternatives 优先，否则生成满足 TD-03 可读性的占位 POI */
function normalizeBlockAlternativesForDso(
  gateResult: GateResultLike,
  alternatives?: OrchestratorAlternativesLike,
): NonNullable<TripState['orchestratorAlternatives']> {
  if (countOrchestratorAlternativeEntries(alternatives) > 0) {
    return {
      alternative_pois: alternatives!.alternative_pois ?? [],
      alternative_routes: alternatives!.alternative_routes ?? [],
    };
  }
  const detail =
    gateResult.violations?.find((v) => typeof v.detail === 'string' && v.detail.trim())?.detail ||
    '门控阻断：请调整约束或日期后重试';
  return {
    alternative_pois: [
      {
        poi_id: 'kernel-gate-block-fallback',
        name: '调整约束后重新生成行程',
        reason: detail.slice(0, 280),
        evidence_status: 'UNVERIFIED',
      },
    ],
    alternative_routes: [],
  };
}
