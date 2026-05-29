// Route-and-run main orchestration chain (extracted from AgentService.routeAndRun)
import type { TripRunDsoCheckpointPayload } from './trip-run-manager.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { mergeTripIdAliasesIntoRouteAndRunRequest } from '../utils/route-and-run-trip-id-merge.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import { MetricsRecorder } from '../utils/agent-metrics.util';
import {
  createDeadline,
  FallbackGuard,
  normalizeError,
  OrchestrationMode,
  StabilityContext,
  withTimeout,
} from './orchestration-stability.util';
import type { RecoveryInvocationContext } from '../interfaces/claude-orchestration.interface';
import { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import { mergeReplanLineageIntoTripRunMetadata } from '../utils/trip-run-replan-metadata.util';
import { classifyOrchestratorFailure } from '../utils/orchestrator-failure-taxonomy.util';
import {
  runRouteAndRunBackoffLoop,
  sleepMs,
  type RouteAndRunBackoffOutcome,
} from '../utils/route-and-run-recovery.util';
import { ExecutionGatewayService } from './execution-gateway.service';
import type { AgentService } from './agent.service';
import { randomUUID } from 'crypto';
import { buildOrchestrationExecutionTraceV1 } from '../contracts/orchestration-execution-trace-v1.types';
import { EXECUTION_MODEL_RUNTIME_ROUTER } from '../runtime/execution-model-runtime-router';
import { buildSemanticModelSnapshotDescriptor } from '../runtime/testing/semantic-model-snapshot-descriptor';
import {
  buildCidSemanticViewV1,
  computeExecutionSemanticFingerprintV1,
  parseChangeImpactDescriptorV1,
} from '../contracts/execution-os-change-impact-descriptor.v1';
import { type AgentTurnContractV1, canonicalTripIdForRouteAndRunRequest } from '../contracts/agent-turn-contract.v1';
import { buildAgentTurnContractTraceSealV1 } from '../contracts/agent-turn-contract-trace-seal.v1';
import type { RuntimeBranchDirective } from '../../governance/activation/runtime/runtime-branch-directive.types';
import {
  type StructuredGovernanceRuntimeTraceV1,
} from '../../governance/activation/runtime/build-structured-governance-runtime-trace.util';
import {
  tryRecordGovernanceBranchOutcomeWithGrsm,
  tryRecordGovernanceBranchSelectedWithGrsm,
} from '../../governance/replanning-runtime/record-governance-branch-on-ledger.util';
import { DecisionRuntimeKernelService } from '../runtime/decision-runtime-kernel.service';
import type { DecisionRuntimeTickBundle } from '../runtime/decision-runtime-kernel.types';

export async function runRouteAndRunMainChain(
  agent: AgentService,
  gateway: ExecutionGatewayService,
  request: RouteAndRunRequestDto,
): Promise<RouteAndRunResponseDto> {
  const $ = agent as any;
  const kernel = $.decisionRuntimeKernel as DecisionRuntimeKernelService | undefined;
  if (!kernel) {
    throw new Error('DecisionRuntimeKernelService is not configured');
  }
  return kernel.handleTick(agent, gateway, request, (bundle) =>
    runRouteAndRunTickBody(agent, $, gateway, request, bundle, kernel),
  );
}

async function runRouteAndRunTickBody(
  agent: AgentService,
  $: any,
  gateway: ExecutionGatewayService,
  request: RouteAndRunRequestDto,
  bundle: DecisionRuntimeTickBundle,
  kernel: DecisionRuntimeKernelService,
): Promise<RouteAndRunResponseDto> {
  const memory = bundle.memory;
  const replayAnchor = bundle.replayAnchor;
  let recoveryTriggered = false;
  const startTime = Date.now();

  mergeTripIdAliasesIntoRouteAndRunRequest(request);
  const canonicalTripIdEarly = canonicalTripIdForRouteAndRunRequest(request);

  const replayStrictSeal = request.options?.orchestration_replay_strict_seal === true;
  await kernel.hydrateGovernanceAndDos(agent, gateway, request, bundle, replayStrictSeal);

  const dosExecutionContext = bundle.dosExecutionContext;
  const governanceStructuredTrace = (request as any).__governanceStructuredTrace;
  const runtimeDirective = (request as any).__runtimeBranchDirective;

  $.logger.log(
    governanceStructuredTrace ?? {
      schemaId: 'tripnara.governance_runtime.trace@v1',
      version: 1,
      governanceSnapshotId: 'n/a',
      activeActivationTypes: [],
      selectedBranch: runtimeDirective?.branchType ?? 'normal_execution',
      unresolvedBlockCount: 0,
      pressureSummary: { weather: 0, world: 0, policy: 0, execution: 0, recovery: 0 },
    },
    `[GovernanceRuntime] trace request_id=${request.request_id}`,
  );

  const withDosContext = async <T>(fn: () => Promise<T>): Promise<T> =>
    kernel.withDosContext(bundle, fn);

    // Phase 0：战略收敛 - 个性化降级显式日志（user_id=anonymous 时 Memory/UserProfile 不可用）
    if (!request.user_id || request.user_id === 'anonymous') {
      $.logger.warn(
        `[Phase0] user_id 缺失或为 anonymous，个性化能力（Memory、UserTravelProfile）不可用。request_id=${request.request_id}`,
      );
    }

    // === TripRun：新建或 v1.0 断点续跑（durable_trip_run_id） ===
    let tripRunId: string | null = null;
    let resumedCheckpoint: TripRunDsoCheckpointPayload | null = null;
    const durableTripRunId = request.options?.durable_trip_run_id?.trim();
    if (durableTripRunId && $.tripRunManager && !request.options?.dry_run) {
      resumedCheckpoint = await $.tripRunManager.loadDsoCheckpoint(durableTripRunId);
      if (resumedCheckpoint) {
        tripRunId = durableTripRunId;
        $.logger.log(
          `[AgentService] Durable：已加载 TripRun=${durableTripRunId} 的 DSO checkpoint（cursor=${resumedCheckpoint.cursor_step ?? 'n/a'}），编排器将执行准入与可选 INTAKE 跳过`,
        );
      }
    }
    if (!tripRunId && $.tripRunManager && !request.options?.dry_run) {
      try {
        // 判断规划阶段
        const isPlanningReq = $.isPlanningRequest(request);
        const planningPhase = isPlanningReq ? 'PLANNING' : 'EXECUTION';

        // 判断当前 Agent（根据路由决策）
        const signals = signalsFromRequest(request);
        const currentAgent = signals.taskType === 'TRIP_PLANNING' ? 'PlanningAgent' : 'ExecutionAgent';

        tripRunId = await $.tripRunManager.createTripRun({
          tripId: request.trip_id || null,
          userId: request.user_id || null,
          userQuery: request.message,
          planningPhase,
          currentAgent,
          metadata: mergeReplanLineageIntoTripRunMetadata(
            {
              request_id: request.request_id,
              entry_point: request.options?.entry_point,
              max_seconds: request.options?.max_seconds,
            },
            request.options,
          ),
        });
        if (tripRunId) {
          $.logger.debug(`Created TripRun: ${tripRunId} for request ${request.request_id}`);
        }
      } catch (error: any) {
        $.logger.warn(`Failed to create TripRun: ${error.message}`);
        // 不阻塞主流程
      }
    }

    // === 稳定化层：统一 Deadline ===
    const maxSeconds = Number(request?.options?.max_seconds ?? 30);
    // 规划类请求在本地/CLI 场景下经常需要 >20s（含 DB + LLM + 多阶段编排）。
    // 这里不再硬上限 20s，而是允许到 120s（仍保留 clamp 防止极端值）。
    let deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 120_000))); // 默认30s，最大120s

    const requestHash = $.hashRequest(request);
    const stabilityCtx: StabilityContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      requestHash,
      deadline,
      startTs: startTime,
      snapshotId: memory.snapshotId,
      snapshotVersion: memory.snapshotVersion,
    };

    const fallback = new FallbackGuard();

    try {
      // === Execution Gateway：dedup + ECPS 准入（全链路唯一 replay 入口） ===
      const admitted = gateway.tryAdmitDedupReplay({
        request,
        requestHash,
        startTime,
        deadline,
      });
      if (admitted) {
        return $.wrapSuccessfulRouteAndRunReturn(
          request,
          admitted.response,
          admitted.obsPayload,
          requestHash,
        );
      }

      const runtimeModelSelection = EXECUTION_MODEL_RUNTIME_ROUTER.select({
        snapshotId: memory.snapshotId,
        executionModelVersion: request.options?.execution_model_version,
        allowUpgrade: request.options?.execution_model_allow_upgrade === true,
        runtimeHint: request.options?.execution_model_runtime_hint,
      });
      $.logger.debug(
        `[ExecutionModelRuntimeRouter] snapshot=${memory.snapshotId} selected=${runtimeModelSelection.selectedExecutionModelVersion} reason=${runtimeModelSelection.reason}`,
      );

      // 0. 规划请求拦截：无 trip_id 的“从零规划”统一重定向到规划工作台
      // 说明：与 contract/spec 对齐（planning-redirect.*），避免进入后续路由/执行链。
      const hasNoTripId = !request.trip_id || request.trip_id === '';
      const isPlanningReq = $.isPlanningRequest(request);
      if (isPlanningReq && hasNoTripId) {
        $.logger.debug(
          `[AgentService] 检测到规划请求且缺少 trip_id，重定向到规划工作台: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`,
        );
        return $.getEntryResponses().createRedirectToPlanningWorkbenchResponse(
          request,
          startTime,
        );
      }

      // 0.1 验证 trip_id（非规划请求且缺少 trip_id 才报错）
      if (hasNoTripId) {
        $.logger.warn(
          `[AgentService] 缺少 trip_id（非规划请求场景）: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`,
        );
        return $.getEntryResponses().createMissingTripIdErrorResponse(
          request,
          startTime,
        );
      }

      // 0.2 检查入口来源和操作权限（只读模式限制）
      if (request.options?.entry_point === 'trip_detail_page' && 
          request.options?.readonly_mode === true) {
        if ($.isModificationRequest(request.message)) {
          $.logger.debug(`[AgentService] 只读模式限制: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
          return $.getEntryResponses().createReadonlyModeRestrictionResponse(
            request,
            startTime,
          );
        }
      }

      if (!replayStrictSeal) {
        const wantsTripSummary =
          request.conversation_context?.context_type?.trim() === 'active_trip_summary';
        if (wantsTripSummary) {
          if (dosExecutionContext) {
            dosExecutionContext.applyNarrativeToConversationContext(request);
          } else {
            await $.routeContextEnricher?.maybeInjectActiveTripSummary(request);
          }
        }
        await $.routeContextEnricher?.maybeInjectUserStandingSummary(request);
      }

      // === 稳定化层：检查 Deadline ===
      if (deadline.isExpired()) {
        throw new Error('TIMEOUT:AGENT_DEADLINE_EXPIRED');
      }

      // 1. 从请求中提取路由信号（规则 + 可选 intent.recognize 覆盖）
      const signals = await $.resolveRoutingSignals(request);
      $.logger.debug(
        `[AgentService] 路由信号提取: taskType=${signals.taskType}, risk=${signals.risk}, complexity=${signals.complexity}, request_id=${request.request_id}`,
      );

      // A3：`async_mode=AUTO` — INTENT_COMPILE 后预分类，重规划切入 Durable Task（E4）
      if ($.routeAndRunAsyncDelegationService) {
        const wouldRedirectToPlanningWorkbench = isPlanningReq && hasNoTripId;
        const planDeltaRaw = bundle.dosExecutionContext?.planDelta;
        const planDelta = planDeltaRaw?.length
          ? planDeltaRaw.map((d) => ({ target: { type: d.target?.type } }))
          : [];
        const delegated = await $.routeAndRunAsyncDelegationService.delegateIfRequested(request, {
          signals,
          planDelta,
          wouldRedirectToPlanningWorkbench,
        });
        if (delegated) {
          $.logger.log(
            `[AgentService] async_mode=AUTO 已委托后台 task_id=${delegated.async_task?.task_id} request_id=${request.request_id}`,
          );
          return $.wrapSuccessfulRouteAndRunReturn(
            request,
            delegated,
            {
              mode_final: 'ASYNC_DELEGATED',
              async_delegation: true,
              task_id: delegated.async_task?.task_id,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
              ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            } as Record<string, unknown>,
            requestHash,
          );
        }
      }

      // 编排 deadline 与路由信号对齐：默认 max_seconds=30 时常小于单次 LLM 超时（如 60s），
      // DATA_LOOKUP 轻量路径会在 DeepSeek 返回前被 withTimeout 掐断 → TripRun FAILED 且 HTTP 仍 200。
      // 酒店/住宿会并行 MCP（单段最多 ~18s）+ RAG + 长文 LLM，显式 30s 预算极易整链超时；对含酒店语义的问法抬升整链 deadline 下限。
      {
        const maxSecondsOpt = Number(request?.options?.max_seconds ?? 30);
        const budgetFromSignals = signals.latencyBudgetMs ?? maxSecondsOpt * 1000;
        let effectiveTotalMs = Math.max(
          1000,
          Math.min(Math.max(maxSecondsOpt * 1000, budgetFromSignals), 120_000),
        );
        const hotelHeavyIntent = /(?:酒店|住宿|民宿|入住|退房|订房|hostel|hotel|booking|accommodation)/i.test(
          request.message ?? '',
        );
        if (hotelHeavyIntent) {
          const before = effectiveTotalMs;
          effectiveTotalMs = Math.min(120_000, Math.max(effectiveTotalMs, 75_000));
          if (effectiveTotalMs > before) {
            $.logger.log(
              `[AgentService] 酒店/住宿问法: deadline 下限抬升至 ${effectiveTotalMs}ms（原 ${before}ms） taskType=${signals.taskType} request_id=${request.request_id}`,
            );
          }
        }
        const tripPlanningHeavy =
          signals.taskType === 'TRIP_PLANNING' ||
          Boolean(request.trip_id?.trim()) ||
          request.options?.enable_guardians_debate_llm === true;
        if (tripPlanningHeavy) {
          const before = effectiveTotalMs;
          effectiveTotalMs = Math.min(120_000, Math.max(effectiveTotalMs, 90_000));
          if (effectiveTotalMs > before) {
            $.logger.log(
              `[AgentService] 行程规划/三人格辩论: deadline 下限抬升至 ${effectiveTotalMs}ms（原 ${before}ms） taskType=${signals.taskType} request_id=${request.request_id}`,
            );
          }
        }
        const elapsed = Date.now() - startTime;
        const remainingWallMs = Math.max(500, effectiveTotalMs - elapsed);
        const refreshedDeadline = createDeadline(remainingWallMs);
        stabilityCtx.deadline = refreshedDeadline;
        // execMode/withTimeout 闭包的是外层变量 deadline，必须与 stabilityCtx 同步，否则会仍按初始 30s 掐断。
        deadline = refreshedDeadline;
        if (effectiveTotalMs > maxSecondsOpt * 1000) {
          $.logger.debug(
            `[AgentService] deadline 已按 latency_budget_ms 放宽: effectiveTotalMs=${effectiveTotalMs}, remainingMs=${remainingWallMs}`,
          );
        }
      }

      // 2. 基于 Feature Flags 和信号进行策略决策（集成 ModeLock 和 Circuit Breaker）
      const decision = routePolicy(
        process.env,
        request.options,
        signals,
        stabilityCtx,
        $.modeLock,
        {
          sm: $.breakerSM,
          dyn: $.breakerDyn,
          legacy: $.breakerLegacy,
        },
      );
      
      // 调试日志：记录路由决策
      $.logger.log(`[AgentService] 路由决策: mode=${decision.mode}, reason=${decision.reason}`);
      $.logger.log(`[AgentService] 匹配规则: ${decision.matchedRules.join(', ')}`);
      $.logger.log(`[AgentService] 熔断器状态: SM=${$.breakerSM.canPass()}, Dynamic=${$.breakerDyn.canPass()}, Legacy=${$.breakerLegacy.canPass()}`);
      // 结构化日志（固定化字段，用于打点/聚合）
      // 结构化日志字段（固定化，用于 metrics/聚合）
      // 这些字段在所有请求中都会输出，方便日志聚合和监控
      const logFields = {
        request_id: request.request_id,
        // 核心编排字段（稳定字段）
        orchestration_mode_resolved: decision.mode, // 实际执行的模式
        orchestration_mode_recommended: decision.recommendations?.useStateMachine ? 'CLAUDE_SM' : decision.mode, // 建议的模式
        task_type: signals.taskType,
        risk: signals.risk,
        requires_consent: decision.recommendations?.requireConsent ?? false,
        needs_audit: decision.recommendations?.enableAudit ?? false,
        // 辅助字段
        max_seconds: request.options?.max_seconds ?? 30,
        latency_budget_ms: signals.latencyBudgetMs,
        reason: decision.reason,
        matched_rules: decision.matchedRules,
      };
      $.logger.log(logFields, `[AgentService] 编排策略决策`);

      const dryRunLedger = request.options?.dry_run === true;
      await tryRecordGovernanceBranchSelectedWithGrsm($.governanceLedgerStore, {
        tripId: canonicalTripIdEarly,
        requestId: request.request_id,
        directive: (request as any).__runtimeBranchDirective as RuntimeBranchDirective,
        dryRun: dryRunLedger,
      });

      const govDirective = (request as any).__runtimeBranchDirective as RuntimeBranchDirective | undefined;
      const gTrace = (request as any).__governanceStructuredTrace as StructuredGovernanceRuntimeTraceV1 | undefined;
      if (govDirective?.branchType === 'needs_confirmation') {
        await tryRecordGovernanceBranchOutcomeWithGrsm($.governanceLedgerStore, {
          tripId: canonicalTripIdEarly,
          requestId: request.request_id,
          directive: govDirective,
          outcome: 'confirmation_requested',
          dryRun: dryRunLedger,
        });
        return $.wrapSuccessfulRouteAndRunReturn(
          request,
          $.getEntryResponses().createGovernanceRuntimeNeedsConfirmationResponse(request, startTime, govDirective, gTrace),
          {
            mode_final: decision.mode,
            governance_runtime: true,
            governance_runtime_trace_v1: gTrace,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            breakers: {
              sm: $.breakerSM.snapshot(),
              dyn: $.breakerDyn.snapshot(),
              legacy: $.breakerLegacy.snapshot(),
            },
            ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
          } as any,
          requestHash,
        );
      }
      if (govDirective?.branchType === 'halted') {
        await tryRecordGovernanceBranchOutcomeWithGrsm($.governanceLedgerStore, {
          tripId: canonicalTripIdEarly,
          requestId: request.request_id,
          directive: govDirective,
          outcome: 'execution_suppressed',
          dryRun: dryRunLedger,
        });
        return $.wrapSuccessfulRouteAndRunReturn(
          request,
          $.getEntryResponses().createGovernanceRuntimeSuppressedExecutionResponse(request, startTime, govDirective, gTrace),
          {
            mode_final: decision.mode,
            governance_runtime: true,
            governance_runtime_trace_v1: gTrace,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            breakers: {
              sm: $.breakerSM.snapshot(),
              dyn: $.breakerDyn.snapshot(),
              legacy: $.breakerLegacy.snapshot(),
            },
            ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
          } as any,
          requestHash,
        );
      }
      
      // Metrics 打点（用于监控和观察）
      MetricsRecorder.recordOrchestrationMode(decision.mode);
      MetricsRecorder.recordRisk(signals.risk);
      if (request.options?.entry_point) {
        MetricsRecorder.recordEntryPoint(request.options.entry_point);
      }
      if (request.options?.readonly_mode !== undefined) {
        MetricsRecorder.recordReadonlyMode(request.options.readonly_mode);
      }
      
      // 详细的 debug 日志
      $.logger.debug(
        `[AgentService] 策略建议: useStateMachine=${decision.recommendations?.useStateMachine}, enableAudit=${decision.recommendations?.enableAudit}, requireConsent=${decision.recommendations?.requireConsent}, recommendation_reason=${decision.recommendations?.reason}`,
      );

      // 记录 trace 信息（用于观测和回放）
      // 关键：明确区分 resolved（实际执行）和 recommended（仅建议）
      const traceInfo = {
        route_decision: {
          task_type: signals.taskType,
          route_policy: decision.mode,
          intent_mode_requested: signals.intent_mode_requested,
          intent_mode_resolved: signals.intent_mode_resolved,
        },
        orchestration: {
          // 实际执行的路径（强制）
          resolved: {
            mode: decision.mode,
            reason: decision.reason,
            matchedRules: decision.matchedRules,
          },
          // 建议（不影响执行）
          recommended: decision.recommendations ? {
            useStateMachine: decision.recommendations.useStateMachine,
            enableAudit: decision.recommendations.enableAudit,
            requireConsent: decision.recommendations.requireConsent,
            reason: decision.recommendations.reason,
          } : undefined,
          // 信号和标志位
          signals: {
            taskType: signals.taskType,
            risk: signals.risk,
            complexity: signals.complexity,
            needsAudit: signals.needsAudit,
            requiresStructuredOutput: signals.requiresStructuredOutput,
            expectsToolCalls: signals.expectsToolCalls,
            legacyWellSupported: signals.legacyWellSupported,
            latencyBudgetMs: signals.latencyBudgetMs,
          },
          flags: {
            env: {
              USE_CLAUDE_ORCHESTRATION: decision.flags.env_USE_CLAUDE_ORCHESTRATION,
            },
            options: {
              use_claude_orchestration: decision.flags.opt_use_claude_orchestration,
              use_state_machine_orchestration: decision.flags.opt_use_state_machine_orchestration,
            },
            derived: {
              use_state_machine_orchestration: decision.flags.derived_use_state_machine_orchestration,
            },
          },
        },
        timestamp: new Date().toISOString(),
        
        // 结构化日志字段（固定化，用于打点/聚合）
        orchestration_mode: decision.mode,
        orchestration_recommended_sm: decision.recommendations?.useStateMachine ?? false,
        risk: signals.risk,
        task_type: signals.taskType,
        requires_consent: decision.recommendations?.requireConsent ?? false,
        max_seconds: request.options?.max_seconds ?? 30,
        latency_budget_ms: signals.latencyBudgetMs,
        execution_memory_binding: {
          snapshot_id: memory.snapshotId,
          snapshot_version: memory.snapshotVersion,
          request_id: request.request_id,
        },
        governance_runtime_trace_v1: (request as { __governanceStructuredTrace?: StructuredGovernanceRuntimeTraceV1 })
          .__governanceStructuredTrace,
        ...((): Record<string, unknown> => {
          const execution_trace_v1 = buildOrchestrationExecutionTraceV1({
            snapshotId: memory.snapshotId,
            modelFingerprint: buildSemanticModelSnapshotDescriptor().fingerprint,
            selectedExecutionModelVersion: runtimeModelSelection.selectedExecutionModelVersion,
            selectionReason: runtimeModelSelection.reason,
            runtimeHint: request.options?.execution_model_runtime_hint ?? null,
            route: {
              task_type: signals.taskType,
              route_policy_resolved: decision.mode,
              intent_mode_requested: signals.intent_mode_requested,
              intent_mode_resolved: signals.intent_mode_resolved,
            },
          });
          const cidParsed =
            request.options?.change_impact_descriptor_v1 != null
              ? parseChangeImpactDescriptorV1(request.options.change_impact_descriptor_v1)
              : null;
          const execution_semantic_fingerprint_v1 = computeExecutionSemanticFingerprintV1({
            modelFingerprint: execution_trace_v1.model_fingerprint,
            routeDecisionPath: execution_trace_v1.route_decision_path,
            changeImpactDescriptor: cidParsed,
          });
          const agentTurnContract = (request as { __agentTurnContract?: AgentTurnContractV1 }).__agentTurnContract;
          const agent_turn_contract_seal_v1 =
            agentTurnContract != null
              ? buildAgentTurnContractTraceSealV1({
                  contract: agentTurnContract,
                  taskType: signals.taskType,
                  readonly_mode: request.options?.readonly_mode,
                })
              : undefined;
          return {
            execution_trace_v1,
            execution_semantic_fingerprint_v1,
            ...(agent_turn_contract_seal_v1 ? { agent_turn_contract_seal_v1 } : {}),
            ...(cidParsed
              ? {
                  change_impact_descriptor_v1: cidParsed,
                  cid_semantic_view_v1: buildCidSemanticViewV1(cidParsed),
                }
              : {}),
          };
        })(),
      };

      const traceInfoAny = traceInfo as Record<string, unknown>;
      const fp = traceInfoAny.execution_semantic_fingerprint_v1;
      if (typeof fp === 'string') {
        $.logger.debug(`[ExecutionOS] execution_semantic_fingerprint_v1=${fp.slice(0, 16)}…`);
      }
      const sv = traceInfoAny.cid_semantic_view_v1 as { fingerprint?: string; classification?: string } | undefined;
      if (sv?.fingerprint) {
        $.logger.debug(
          `[ExecutionOS] cid_semantic_view_v1 fp=${String(sv.fingerprint).slice(0, 16)}… class=${String(sv.classification)}`,
        );
      }

      const cidOnTrace = traceInfoAny.change_impact_descriptor_v1;
      if (
        replayStrictSeal &&
        cidOnTrace &&
        typeof cidOnTrace === 'object' &&
        cidOnTrace !== null &&
        'classification' in cidOnTrace
      ) {
        const classification = (cidOnTrace as { classification?: unknown }).classification;
        $.logger.debug(
          `[ExecutionOS] trace carries CID under replay strict seal: classification=${String(classification)}`,
        );
      }

      $.executionTimelineRecorder?.recordPoint({
        phase: 'orchestration',
        eventType: 'route_policy.resolved',
        nodeId: 'orch:route_policy',
        parentNodeId: 'rr:gold:enter',
        inputPayload: {
          task_type: signals.taskType,
          mode: decision.mode,
          risk: signals.risk,
        },
      });

      // 3. 根据决策执行相应路径（集成稳定化层：withTimeout + Circuit Breaker + Fallback）
      const fallbackOrder: Record<OrchestrationMode, OrchestrationMode[]> = {
        CLAUDE_SM: ['CLAUDE_DYNAMIC', 'LEGACY'],
        CLAUDE_DYNAMIC: ['LEGACY'],
        LEGACY: [],
      };

      let finalMode: OrchestrationMode = decision.mode;
      let usedFallback = false;

      const execMode = async (
        mode: OrchestrationMode,
        recoveryInvocation?: RecoveryInvocationContext,
      ): Promise<RouteAndRunResponseDto> => {
        const remaining = deadline.remainingMs();
        if (remaining <= 0) throw new Error('TIMEOUT:AGENT_DEADLINE');

        if (mode === 'CLAUDE_SM') {
          if (!$.claudeOrchestrator) throw new Error('CLAUDE_SM_UNAVAILABLE');
          if (!$.breakerSM.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_SM');
          const orchestrationAbort = new AbortController();
          const res = await withDosContext(() =>
            withTimeout<RouteAndRunResponseDto>(
              $.routeAndRunWithClaudeStateMachine(
                request,
                startTime,
                traceInfo,
                deadline,
                tripRunId,
                resumedCheckpoint,
                orchestrationAbort,
                recoveryInvocation,
                signals.taskType,
              ),
              remaining,
              'CLAUDE_SM',
              { abortController: orchestrationAbort },
            ),
          );
          $.breakerSM.onSuccess();
          return res;
        }

        if (mode === 'CLAUDE_DYNAMIC') {
          if (!$.claudeOrchestrator) throw new Error('CLAUDE_DYNAMIC_UNAVAILABLE');
          if (!$.breakerDyn.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_DYNAMIC');
          const res = await withDosContext(() =>
            withTimeout<RouteAndRunResponseDto>(
              $.routeAndRunWithClaude(request, startTime, traceInfo, deadline),
              remaining,
              'CLAUDE_DYNAMIC',
            ),
          );
          $.breakerDyn.onSuccess();
          return res;
        }

        // LEGACY mode
        if (!$.breakerLegacy.canPass()) throw new Error('BREAKER_OPEN:LEGACY');
        const res = await withTimeout<RouteAndRunResponseDto>(
          $.routeAndRunLegacy(request, startTime, traceInfo, deadline),
          remaining,
          'LEGACY'
        );
        $.breakerLegacy.onSuccess();
        return res;
      };

      try {
        /** Agentic 快路径：FEATURE_AGENTIC_RUNTIME_MCP_CAP / FEATURE_AGENTIC_GOVERNANCE_HITL；相位 options.agentic_runtime_planning_phase；tool 面 TripTask.constraints.toolAllowlist；策略 tool_policies；HITL 续跑 approved_tool_invocations + options.agentic_approved_tool_invocations。 */
        const agenticFastPath = await $.tryExecuteAgenticToolLoopFastPath(
          request,
          startTime,
          traceInfo,
          signals,
          decision,
          deadline,
          memory,
        );
        if (agenticFastPath) {
          $.modeLock.set(stabilityCtx, decision.mode);
          if (tripRunId && $.tripRunManager) {
            try {
              await $.tripRunManager.completeTripRun(tripRunId, {
                mode_final: decision.mode,
                fallback_used: false,
                latency_ms: Date.now() - startTime,
              });
            } catch (error: any) {
              $.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
            }
          }
          return $.wrapSuccessfulRouteAndRunReturn(
            request,
            agenticFastPath,
            {
              mode_final: decision.mode,
              fallback_used: false,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
              breakers: {
                sm: $.breakerSM.snapshot(),
                dyn: $.breakerDyn.snapshot(),
                legacy: $.breakerLegacy.snapshot(),
              },
              agentic_tool_loop: true,
              ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
              ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
            } as any,
            requestHash,
          );
        }

        $.executionTimelineRecorder?.recordPoint({
          phase: decision.mode === 'CLAUDE_SM' ? 'planner' : 'orchestration',
          eventType: `exec.invoke.${decision.mode}`,
          nodeId: `orch:exec:${decision.mode}`,
          parentNodeId: 'orch:route_policy',
          inputPayload: { mode: decision.mode },
        });

        const res = await execMode(decision.mode);
        // 成功：记录 ModeLock
        $.modeLock.set(stabilityCtx, decision.mode);
        
        // === 更新 TripRun 为 COMPLETED ===
        if (tripRunId && $.tripRunManager) {
          try {
            await $.tripRunManager.completeTripRun(tripRunId, {
              mode_final: decision.mode,
              fallback_used: false,
              latency_ms: Date.now() - startTime,
            });
          } catch (error: any) {
            $.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
          }
        }
        
        return $.wrapSuccessfulRouteAndRunReturn(
          request,
          res,
          {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            breakers: {
              sm: $.breakerSM.snapshot(),
              dyn: $.breakerDyn.snapshot(),
              legacy: $.breakerLegacy.snapshot(),
            },
            ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
          },
          requestHash,
        );
      } catch (e: any) {
        let workingErr: any = e;
        const recoveryTrace: Array<{
          attempt: number;
          backoff_ms: number;
          failure_code?: string;
          elapsed_ms: number;
          recorded_at: string;
        }> = [];

        let robustness = classifyOrchestratorFailure(workingErr, {});
        let recoveryPlan = $.resolveRecoveryPlanMeta(robustness);

        await $.appendRecoveryAuditSafe(tripRunId, {
          phase: 'initial_failure',
          orchestrator_robustness: robustness,
          recovery_plan_kind: recoveryPlan?.kind ?? null,
        });
        await $.appendTripTaskMemoryRecoveryAudit(request.trip_id, request.request_id, {
          phase: 'initial_failure',
          is_retry: false,
          failure_domain: robustness.failure_domain,
          failure_code: robustness.failure_code,
          recovery_plan_kind: recoveryPlan?.kind ?? null,
        });

        if (recoveryPlan?.kind === 'REQUEST_CLARIFICATION') {
          $.executionIntegration?.logRecoveryPlan(recoveryPlan, robustness);
          await $.appendRecoveryAuditSafe(tripRunId, {
            phase: 'clarification_return',
            orchestrator_robustness: robustness,
          });
          return $.wrapSuccessfulRouteAndRunReturn(
            request,
            $.buildRecoveryClarificationRouteResponse(request, startTime, robustness, recoveryPlan, {
              mode_final: decision.mode,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
              ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            }),
            {
              mode_final: decision.mode,
              fallback_used: false,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
              breakers: {
                sm: $.breakerSM.snapshot(),
                dyn: $.breakerDyn.snapshot(),
                legacy: $.breakerLegacy.snapshot(),
              },
              ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
              ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
            },
            requestHash,
          );
        }

        if (
          recoveryPlan?.kind === 'RETRY_WITH_EXPONENTIAL_BACKOFF' &&
          recoveryPlan.backoff &&
          deadline.remainingMs() > 1500
        ) {
          const b = recoveryPlan.backoff;
          $.executionIntegration?.logRecoveryPlan(recoveryPlan, robustness);

          const runBackoff =
            $.executionIntegration?.executeRouteAndRunRecoveryLoop.bind($.executionIntegration) ??
            runRouteAndRunBackoffLoop;

          const backoffOutcome: RouteAndRunBackoffOutcome<RouteAndRunResponseDto> = await (
            runBackoff as typeof runRouteAndRunBackoffLoop
          )<RouteAndRunResponseDto>({
            initialError: workingErr,
            backoff: b,
            remainingMs: () => deadline.remainingMs(),
            requestStartMs: startTime,
            initialRobustness: robustness,
            classifyError: (err) => classifyOrchestratorFailure(err, {}),
            resolveRecoveryPlan: (m) => $.resolveRecoveryPlanMeta(m),
            sleepMs,
            executeAttempt: async (recoveryInvocation, attempt, traceRef) => {
              try {
                $.memoryContextAssembler?.refreshOperationalNegativeExecutionOverlay?.();
              } catch {
                /* best-effort: 重试前对齐负向约束 overlay */
              }
              const res = await execMode(decision.mode, recoveryInvocation);
              $.modeLock.set(stabilityCtx, decision.mode);
              if (tripRunId && $.tripRunManager) {
                try {
                  await $.tripRunManager.completeTripRun(tripRunId, {
                    mode_final: decision.mode,
                    fallback_used: false,
                    latency_ms: Date.now() - startTime,
                    recovery_retry_attempts: attempt,
                    recovery_trace: traceRef,
                  });
                } catch (err: any) {
                  $.logger.warn(`Failed to update TripRun to COMPLETED: ${err.message}`);
                }
              }
              return res;
            },
            onBeforeRetry: async ({ attempt, delayMs, robustness: rob }) => {
              recoveryTriggered = true;
              $.executionTimelineRecorder?.recordPoint({
                phase: 'recovery',
                eventType: 'retry.before_sleep',
                nodeId: `recovery:retry:${attempt}`,
                parentNodeId: 'orch:route_policy',
                status: 'retry',
                inputPayload: {
                  attempt,
                  delay_ms: delayMs,
                  failure_code: rob.failure_code,
                  failure_domain: rob.failure_domain,
                },
              });
              await $.appendRecoveryAuditSafe(tripRunId, {
                phase: 'retry_attempt',
                attempt,
                backoff_ms: delayMs,
                orchestrator_robustness: rob,
              });
              await $.appendTripTaskMemoryRecoveryAudit(request.trip_id, request.request_id, {
                phase: 'retry_attempt',
                is_retry: true,
                retry_attempt: attempt,
                backoff_ms: delayMs,
                failure_domain: rob.failure_domain,
                failure_code: rob.failure_code,
              });
            },
            onRetryFailure: async ({ robustness: rob, recoveryPlan: rp }) => {
              await $.appendRecoveryAuditSafe(tripRunId, {
                phase: 'retry_failure',
                orchestrator_robustness: rob,
                recovery_plan_kind: rp?.kind ?? null,
              });
            },
          });

          if (backoffOutcome.ok === true) {
            return $.wrapSuccessfulRouteAndRunReturn(request, backoffOutcome.result, {
              mode_final: decision.mode,
              fallback_used: false,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
              recovery_retry_attempts: backoffOutcome.winningAttempt,
              recovery_trace: backoffOutcome.trace,
              breakers: {
                sm: $.breakerSM.snapshot(),
                dyn: $.breakerDyn.snapshot(),
                legacy: $.breakerLegacy.snapshot(),
              },
              ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
              ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
            }, requestHash);
          } else {
            workingErr = backoffOutcome.lastError;
            robustness = backoffOutcome.lastRobustness;
            recoveryPlan = $.resolveRecoveryPlanMeta(robustness);
            recoveryTrace.push(...backoffOutcome.trace);
            e = workingErr;
          }
        }

        // 主编排模式在本请求内确认失败后记一次熔断（含：无退避、退避用尽、或未能进入退避分支但仍持有 workingErr）
        // REQUEST_CLARIFICATION 已在上方 return，不会到达此处。
        $.recordPrimaryOrchestrationBreakerFailure(decision.mode, workingErr);

        // === 稳定化层：单次 Fallback ===
        const canFallback = !replayStrictSeal && fallback.tryUse();
        if (!canFallback || deadline.remainingMs() <= 0) {
          const nf = normalizeError(e);

          // === 更新 TripRun 为 FAILED ===
          if (tripRunId && $.tripRunManager) {
            try {
              await $.tripRunManager.failTripRun(tripRunId, e, {
                mode_final: decision.mode,
                fallback_used: false,
                latency_ms: Date.now() - startTime,
                orchestrator_robustness: classifyOrchestratorFailure(e, {}),
                recovery_trace: recoveryTrace,
                recovery_retry_attempts: recoveryTrace.length,
              });
            } catch (error: any) {
              $.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
            }
          }

          // 🆕 尝试从错误中提取部分决策日志（如果是状态机超时）
          let partialDecisionLog: DecisionLogEntry[] | undefined;
          if (decision.mode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
            $.logger.warn(`[AgentService] 状态机超时，无法提取部分结果（需要状态机内部处理）`);
          }

          return $.buildFailureResponse(request, startTime, nf, {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            recovery_trace: recoveryTrace,
            recovery_retry_attempts: recoveryTrace.length,
          }, partialDecisionLog);
        }

        usedFallback = true;

        // 尝试 fallback 链
        const chain = fallbackOrder[decision.mode] ?? [];
        for (const nextMode of chain) {
          if (deadline.remainingMs() <= 0) break;

          try {
            finalMode = nextMode;
            const res = await execMode(nextMode);
            // 成功：记录 ModeLock
            $.modeLock.set(stabilityCtx, nextMode);
            
            // === 更新 TripRun 为 COMPLETED ===
            if (tripRunId && $.tripRunManager) {
              try {
                await $.tripRunManager.completeTripRun(tripRunId, {
                  mode_final: nextMode,
                  fallback_used: true,
                  latency_ms: Date.now() - startTime,
                });
              } catch (error: any) {
                $.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
              }
            }
            
            return $.wrapSuccessfulRouteAndRunReturn(
              request,
              res,
              {
                mode_final: nextMode,
                fallback_used: true,
                deadline_ms: deadline.totalMs,
                time_remaining_ms: deadline.remainingMs(),
                breakers: {
                  sm: $.breakerSM.snapshot(),
                  dyn: $.breakerDyn.snapshot(),
                  legacy: $.breakerLegacy.snapshot(),
                },
                ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
                ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
              },
              requestHash,
            );
          } catch (e2: any) {
            // 标记 Circuit Breaker 失败
            if (nextMode === 'CLAUDE_SM') $.breakerSM.onFailure(e2);
            else if (nextMode === 'CLAUDE_DYNAMIC') $.breakerDyn.onFailure(e2);
            else $.breakerLegacy.onFailure(e2);
            continue;
          }
        }

        // 所有 fallback 都失败
        const nf = normalizeError(e);

        // === 更新 TripRun 为 FAILED ===
        if (tripRunId && $.tripRunManager) {
          try {
            await $.tripRunManager.failTripRun(tripRunId, e, {
              mode_final: finalMode,
              fallback_used: usedFallback,
              latency_ms: Date.now() - startTime,
              orchestrator_robustness: classifyOrchestratorFailure(e, {}),
              recovery_trace: recoveryTrace,
              recovery_retry_attempts: recoveryTrace.length,
            });
          } catch (error: any) {
            $.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
          }
        }

        // 🆕 尝试提取部分决策日志
        let partialDecisionLog: DecisionLogEntry[] | undefined;
        if (finalMode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
          $.logger.warn(`[AgentService] 状态机超时，无法提取部分结果`);
        }

        return $.buildFailureResponse(request, startTime, nf, {
          mode_final: finalMode,
          fallback_used: usedFallback,
          deadline_ms: deadline.totalMs,
          time_remaining_ms: deadline.remainingMs(),
          recovery_trace: recoveryTrace,
          recovery_retry_attempts: recoveryTrace.length,
        }, partialDecisionLog);
      }
      // 理论上不可达：上面 success/fallback/failure 都应返回
      throw new Error('UNREACHABLE: routeAndRun fell through stability execution');
    } catch (error: any) {
      $.logger.error(`Agent service error: ${error?.message || String(error)}`, error?.stack);
      
      // === 更新 TripRun 为 FAILED（最外层 catch） ===
      if (tripRunId && $.tripRunManager) {
        try {
          await $.tripRunManager.failTripRun(tripRunId, error, {
            error_type: 'unhandled_exception',
            caught_at: 'routeAndRun_outer_catch',
          });
        } catch (updateError: any) {
          $.logger.warn(`Failed to update TripRun to FAILED in outer catch: ${updateError.message}`);
        }
      }
      
      throw error;
    }
}
