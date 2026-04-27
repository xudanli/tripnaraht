// src/agent/services/agent.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentState } from '../interfaces/agent-state.interface';
import { RouteType, RouterReason, UIStatus } from '../interfaces/router.interface';
import { RouterService } from './router.service';
import { AgentStateService } from './agent-state.service';
import { System1ExecutorService } from './system1-executor.service';
import { OrchestratorService } from './orchestrator.service';
import { DAGOrchestratorService } from '../plan-execute/orchestrator.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { EventTelemetryService } from './event-telemetry.service';
import { RequestDeduplicationService } from './request-deduplication.service';
import { TripRunManagerService, type TripRunDsoCheckpointPayload } from './trip-run-manager.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { TokenCalculator } from '../utils/token-calculator.util';
import { AgentContext } from '../interfaces/claude-orchestration.interface';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import {
  OrchestrationStep,
  SubAgentType,
  DecisionLogEntry,
  OrchestratorState,
} from '../interfaces/trip-plan.interface';
import { MetricsRecorder } from '../utils/agent-metrics.util';
import { type PolicyAction } from '../utils/external-verdict.util';
import { RLIntegrationService } from '../training/services/rl-integration.service';
import {
  CircuitBreaker,
  createDeadline,
  FallbackGuard,
  ModeLock,
  normalizeError,
  OrchestrationMode,
  StabilityContext,
  withTimeout,
} from './orchestration-stability.util';
import { ErrorType } from '../interfaces/error-types.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildTravelOntologyStateFromOrchestrator, mergeTravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { AgentEntryResponseFactoryService } from './agent-entry-response-factory.service';
import { PlanningRequestClassifierService } from './planning-request-classifier.service';
import { ModuleRef } from '@nestjs/core';
import type { DecisionLogEntry as TripsDecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { DecisionStage as TripsDecisionStage } from '../../trips/decision/shared/decision-result.types';
import type { DecisionPersona as TripsDecisionPersona } from '../../trips/decision/shared/decision-result.types';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';

/**
 * Agent Service
 * 
 * 统一入口服务：协调 Router、System1、System2
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  //稳定层组件
  private readonly modeLock = new ModeLock();
  private readonly breakerSM = new CircuitBreaker(3, 30_000); // 3次失败后熔断30秒
  private readonly breakerDyn = new CircuitBreaker(3, 30_000);
  private readonly breakerLegacy = new CircuitBreaker(5, 15_000); // LEGACY 更宽松

  constructor(
    private router: RouterService,
    private stateService: AgentStateService,
    private system1Executor: System1ExecutorService,
    private orchestrator: OrchestratorService,
    @Optional() private dagOrchestrator?: DAGOrchestratorService,
    @Optional() private claudeOrchestrator?: ClaudeOrchestratorService,
    private eventTelemetry?: EventTelemetryService,
    private requestDeduplication?: RequestDeduplicationService,
    @Optional() private tripRunManager?: TripRunManagerService,
    @Optional() private rlIntegration?: RLIntegrationService,
    @Optional() private responseAssembler?: RouteAndRunResponseAssemblerService,
    @Optional() private entryResponses?: AgentEntryResponseFactoryService,
    @Optional() private planningRequestClassifier?: PlanningRequestClassifierService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private shouldPersistRouteAndRunDecisionLogs(request: RouteAndRunRequestDto): boolean {
    if (request.options?.dry_run) return false;
    const v = String(process.env.ROUTE_AND_RUN_PERSIST_DECISION_LOGS ?? '').toLowerCase();
    return v === '1' || v === 'true';
  }

  private resolveTripsPersonaFromAgentLog(log: DecisionLogEntry): TripsDecisionPersona {
    const g = String((log.metadata as any)?.guardian ?? '').toUpperCase();
    if (g === 'ABU' || g === 'DR_DRE' || g === 'NEPTUNE') return g as TripsDecisionPersona;
    const actor = String(log.actor ?? '');
    if (actor === 'Gatekeeper') return 'ABU';
    if (actor === 'LocalInsight') return 'NEPTUNE';
    if (actor === 'CoreDecision') return 'DR_DRE';
    return 'USER_ACTION';
  }

  private resolveTripsStageFromStep(step: OrchestrationStep): TripsDecisionStage {
    const s = String(step ?? '').toUpperCase();
    if (s === 'GATE_EVAL') return 'ABU_GATE';
    if (s === 'REPAIR') return 'SPATIAL_REPAIR';
    if (s === 'VERIFY') return 'FINALIZE';
    if (s === 'PLAN_GEN' || s === 'OPTIMIZE') return 'PLAN_SCORE';
    if (s === 'INTAKE') return 'ROUTE_PICK';
    return 'FINALIZE';
  }

  private mapRouteAndRunDecisionLogToTrips(entries: DecisionLogEntry[]): TripsDecisionLogEntry[] {
    const out: TripsDecisionLogEntry[] = [];
    for (const it of entries ?? []) {
      if (!it || typeof it !== 'object') continue;
      const ts = typeof it.timestamp === 'string' ? it.timestamp : new Date().toISOString();
      const meta = (it.metadata && typeof it.metadata === 'object') ? { ...(it.metadata as any) } : {};
      // Preserve original orchestration log payload for audit/debug.
      const persistMeta = {
        ...meta,
        route_and_run: {
          request_id: it.request_id,
          step: it.step,
          actor: it.actor,
          inputs_summary: it.inputs_summary,
          outputs_summary: it.outputs_summary,
        },
      };
      out.push({
        persona: this.resolveTripsPersonaFromAgentLog(it),
        action: 'EVALUATE',
        explanation: String(it.outputs_summary ?? '').slice(0, 4000),
        reasonCodes: [String(it.step ?? 'UNKNOWN_STEP')],
        evidenceRefs: Array.isArray(it.evidence_refs) ? it.evidence_refs.map((x) => String(x)) : [],
        timestamp: ts,
        decisionSource: 'HEURISTIC',
        decisionStage: this.resolveTripsStageFromStep(it.step),
        metadata: persistMeta,
      });
    }
    return out;
  }

  private async persistRouteAndRunDecisionLogs(params: {
    request: RouteAndRunRequestDto;
    orchestrationDecisionLog?: DecisionLogEntry[];
  }): Promise<void> {
    if (!this.shouldPersistRouteAndRunDecisionLogs(params.request)) return;
    const logs = params.orchestrationDecisionLog ?? [];
    if (logs.length === 0) return;
    if (!this.moduleRef) return;
    let storage: DecisionLogStorageService | undefined;
    try {
      storage = this.moduleRef.get(DecisionLogStorageService, { strict: false });
    } catch {
      storage = undefined;
    }
    if (!storage) return;
    const mapped = this.mapRouteAndRunDecisionLogToTrips(logs);
    if (mapped.length === 0) return;
    await storage.saveLogEntries(mapped, {
      tripId: params.request.trip_id ?? undefined,
      metadata: { source: 'route_and_run' },
    });
  }

  private getResponseAssembler(): RouteAndRunResponseAssemblerService {
    return (
      this.responseAssembler ??
      new RouteAndRunResponseAssemblerService(new JepaProjectorService())
    );
  }

  private getEntryResponses(): AgentEntryResponseFactoryService {
    return (
      this.entryResponses ??
      new AgentEntryResponseFactoryService(this.responseAssembler)
    );
  }

  private isPlanningRequest(request: RouteAndRunRequestDto): boolean {
    return (
      this.planningRequestClassifier ??
      new PlanningRequestClassifierService()
    ).isPlanningRequest(request);
  }

  /**
   * 生成请求哈希（用于去重和 ModeLock）
   */
  private hashRequest(request: RouteAndRunRequestDto): string {
    // 保持稳定：message + trip + options 中影响结果的字段
    const stable = {
      trip_id: request.trip_id ?? null,
      message: request.message ?? '',
      options: {
        entry_point: request?.options?.entry_point,
        use_claude_orchestration: request?.options?.use_claude_orchestration,
        use_state_machine_orchestration: request?.options?.use_state_machine_orchestration,
        max_seconds: request?.options?.max_seconds,
      },
    };
    // 简单哈希（可替换为现有的哈希工具）
    const s = JSON.stringify(stable);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }

  /**
   * 路由并执行（集成稳定化层）
   */
  async routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    const startTime = Date.now();
    this.logger.debug(`Processing request: ${request.request_id}`);

    // Phase 0：战略收敛 - 个性化降级显式日志（user_id=anonymous 时 Memory/UserProfile 不可用）
    if (!request.user_id || request.user_id === 'anonymous') {
      this.logger.warn(
        `[Phase0] user_id 缺失或为 anonymous，个性化能力（Memory、UserTravelProfile）不可用。request_id=${request.request_id}`,
      );
    }

    // === TripRun：新建或 v1.0 断点续跑（durable_trip_run_id） ===
    let tripRunId: string | null = null;
    let resumedCheckpoint: TripRunDsoCheckpointPayload | null = null;
    const durableTripRunId = request.options?.durable_trip_run_id?.trim();
    if (durableTripRunId && this.tripRunManager && !request.options?.dry_run) {
      resumedCheckpoint = await this.tripRunManager.loadDsoCheckpoint(durableTripRunId);
      if (resumedCheckpoint) {
        tripRunId = durableTripRunId;
        this.logger.log(
          `[AgentService] Durable：已加载 TripRun=${durableTripRunId} 的 DSO checkpoint（cursor=${resumedCheckpoint.cursor_step ?? 'n/a'}），编排器将执行准入与可选 INTAKE 跳过`,
        );
      }
    }
    if (!tripRunId && this.tripRunManager && !request.options?.dry_run) {
      try {
        // 判断规划阶段
        const isPlanningReq = this.isPlanningRequest(request);
        const planningPhase = isPlanningReq ? 'PLANNING' : 'EXECUTION';

        // 判断当前 Agent（根据路由决策）
        const signals = signalsFromRequest(request);
        const currentAgent = signals.taskType === 'TRIP_PLANNING' ? 'PlanningAgent' : 'ExecutionAgent';

        tripRunId = await this.tripRunManager.createTripRun({
          tripId: request.trip_id || null,
          userId: request.user_id || null,
          userQuery: request.message,
          planningPhase,
          currentAgent,
          metadata: {
            request_id: request.request_id,
            entry_point: request.options?.entry_point,
            max_seconds: request.options?.max_seconds,
          },
        });
        if (tripRunId) {
          this.logger.debug(`Created TripRun: ${tripRunId} for request ${request.request_id}`);
        }
      } catch (error: any) {
        this.logger.warn(`Failed to create TripRun: ${error.message}`);
        // 不阻塞主流程
      }
    }

    // === 稳定化层：统一 Deadline ===
    const maxSeconds = Number(request?.options?.max_seconds ?? 12);
    // 规划类请求在本地/CLI 场景下经常需要 >20s（含 DB + LLM + 多阶段编排）。
    // 这里不再硬上限 20s，而是允许到 120s（仍保留 clamp 防止极端值）。
    const deadline = createDeadline(Math.max(1000, Math.min(maxSeconds * 1000, 120_000))); // 默认12s，最大120s

    const requestHash = this.hashRequest(request);
    const stabilityCtx: StabilityContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      requestHash,
      deadline,
      startTs: startTime,
    };

    const fallback = new FallbackGuard();

    try {
      // === 稳定化层：统一去重（在所有模式之前） ===
      if (this.requestDeduplication && !request.options?.dry_run) {
        const cachedResponse = this.requestDeduplication.checkDuplicate(requestHash);
        if (cachedResponse) {
          const dedupedResponse: RouteAndRunResponseDto = {
            ...cachedResponse,
            request_id: request.request_id,
            observability: {
              ...cachedResponse.observability,
              latency_ms: Date.now() - startTime,
            },
          };
          this.logger.debug(`Request deduplication: reusing cached result for request ${request.request_id}`);
          return this.attachObservability(
            dedupedResponse,
            {
              mode_final: 'DEDUP',
              fallback_used: false,
              deadline_ms: deadline.totalMs,
              time_remaining_ms: deadline.remainingMs(),
            },
            request,
          );
        }
      }
      // 0. 规划请求拦截：无 trip_id 的“从零规划”统一重定向到规划工作台
      // 说明：与 contract/spec 对齐（planning-redirect.*），避免进入后续路由/执行链。
      const hasNoTripId = !request.trip_id || request.trip_id === '';
      const isPlanningReq = this.isPlanningRequest(request);
      if (isPlanningReq && hasNoTripId) {
        this.logger.debug(
          `[AgentService] 检测到规划请求且缺少 trip_id，重定向到规划工作台: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`,
        );
        return this.getEntryResponses().createRedirectToPlanningWorkbenchResponse(
          request,
          startTime,
        );
      }

      // 0.1 验证 trip_id（非规划请求且缺少 trip_id 才报错）
      if (hasNoTripId) {
        this.logger.warn(
          `[AgentService] 缺少 trip_id（非规划请求场景）: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`,
        );
        return this.getEntryResponses().createMissingTripIdErrorResponse(
          request,
          startTime,
        );
      }

      // 0.2 检查入口来源和操作权限（只读模式限制）
      if (request.options?.entry_point === 'trip_detail_page' && 
          request.options?.readonly_mode === true) {
        if (this.isModificationRequest(request.message)) {
          this.logger.debug(`[AgentService] 只读模式限制: request_id=${request.request_id}, message=${request.message.substring(0, 50)}...`);
          return this.getEntryResponses().createReadonlyModeRestrictionResponse(
            request,
            startTime,
          );
        }
      }

      // === 稳定化层：检查 Deadline ===
      if (deadline.isExpired()) {
        throw new Error('TIMEOUT:AGENT_DEADLINE_EXPIRED');
      }

      // 1. 从请求中提取路由信号
      const signals = signalsFromRequest(request);
      this.logger.debug(
        `[AgentService] 路由信号提取: taskType=${signals.taskType}, risk=${signals.risk}, complexity=${signals.complexity}, request_id=${request.request_id}`,
      );

      // 2. 基于 Feature Flags 和信号进行策略决策（集成 ModeLock 和 Circuit Breaker）
      const decision = routePolicy(
        process.env,
        request.options,
        signals,
        stabilityCtx,
        this.modeLock,
        {
          sm: this.breakerSM,
          dyn: this.breakerDyn,
          legacy: this.breakerLegacy,
        },
      );
      
      // 调试日志：记录路由决策
      this.logger.log(`[AgentService] 路由决策: mode=${decision.mode}, reason=${decision.reason}`);
      this.logger.log(`[AgentService] 匹配规则: ${decision.matchedRules.join(', ')}`);
      this.logger.log(`[AgentService] 熔断器状态: SM=${this.breakerSM.canPass()}, Dynamic=${this.breakerDyn.canPass()}, Legacy=${this.breakerLegacy.canPass()}`);
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
        max_seconds: request.options?.max_seconds ?? 60,
        latency_budget_ms: signals.latencyBudgetMs,
        reason: decision.reason,
        matched_rules: decision.matchedRules,
      };
      this.logger.log(logFields, `[AgentService] 编排策略决策`);
      
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
      this.logger.debug(
        `[AgentService] 策略建议: useStateMachine=${decision.recommendations?.useStateMachine}, enableAudit=${decision.recommendations?.enableAudit}, requireConsent=${decision.recommendations?.requireConsent}, recommendation_reason=${decision.recommendations?.reason}`,
      );

      // 记录 trace 信息（用于观测和回放）
      // 关键：明确区分 resolved（实际执行）和 recommended（仅建议）
      const traceInfo = {
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
        max_seconds: request.options?.max_seconds ?? 60,
        latency_budget_ms: signals.latencyBudgetMs,
      };

      // 3. 根据决策执行相应路径（集成稳定化层：withTimeout + Circuit Breaker + Fallback）
      const fallbackOrder: Record<OrchestrationMode, OrchestrationMode[]> = {
        CLAUDE_SM: ['CLAUDE_DYNAMIC', 'LEGACY'],
        CLAUDE_DYNAMIC: ['LEGACY'],
        LEGACY: [],
      };

      let finalMode: OrchestrationMode = decision.mode;
      let usedFallback = false;

      const execMode = async (mode: OrchestrationMode): Promise<RouteAndRunResponseDto> => {
        const remaining = deadline.remainingMs();
        if (remaining <= 0) throw new Error('TIMEOUT:AGENT_DEADLINE');

        if (mode === 'CLAUDE_SM') {
          if (!this.claudeOrchestrator) throw new Error('CLAUDE_SM_UNAVAILABLE');
          if (!this.breakerSM.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_SM');
          const res = await withTimeout(
            this.routeAndRunWithClaudeStateMachine(
              request,
              startTime,
              traceInfo,
              deadline,
              tripRunId,
              resumedCheckpoint,
            ),
            remaining,
            'CLAUDE_SM'
          );
          this.breakerSM.onSuccess();
          return res;
        }

        if (mode === 'CLAUDE_DYNAMIC') {
          if (!this.claudeOrchestrator) throw new Error('CLAUDE_DYNAMIC_UNAVAILABLE');
          if (!this.breakerDyn.canPass()) throw new Error('BREAKER_OPEN:CLAUDE_DYNAMIC');
          const res = await withTimeout(
            this.routeAndRunWithClaude(request, startTime, traceInfo, deadline),
            remaining,
            'CLAUDE_DYNAMIC'
          );
          this.breakerDyn.onSuccess();
          return res;
        }

        // LEGACY mode
        if (!this.breakerLegacy.canPass()) throw new Error('BREAKER_OPEN:LEGACY');
        const res = await withTimeout(
          this.routeAndRunLegacy(request, startTime, traceInfo, deadline),
          remaining,
          'LEGACY'
        );
        this.breakerLegacy.onSuccess();
        return res;
      };

      try {
        const res = await execMode(decision.mode);
        // 成功：记录 ModeLock
        this.modeLock.set(stabilityCtx, decision.mode);
        
        // === 更新 TripRun 为 COMPLETED ===
        if (tripRunId && this.tripRunManager) {
          try {
            await this.tripRunManager.completeTripRun(tripRunId, {
              mode_final: decision.mode,
              fallback_used: false,
              latency_ms: Date.now() - startTime,
            });
          } catch (error: any) {
            this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
          }
        }
        
        return this.attachObservability(
          res,
          {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
            breakers: {
              sm: this.breakerSM.snapshot(),
              dyn: this.breakerDyn.snapshot(),
              legacy: this.breakerLegacy.snapshot(),
            },
            ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
            ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
          },
          request,
        );
      } catch (e: any) {
        // 标记 Circuit Breaker 失败
        if (decision.mode === 'CLAUDE_SM') this.breakerSM.onFailure(e);
        else if (decision.mode === 'CLAUDE_DYNAMIC') this.breakerDyn.onFailure(e);
        else this.breakerLegacy.onFailure(e);

        // === 稳定化层：单次 Fallback ===
        const canFallback = fallback.tryUse();
        if (!canFallback || deadline.remainingMs() <= 0) {
          const nf = normalizeError(e);
          
          // === 更新 TripRun 为 FAILED ===
          if (tripRunId && this.tripRunManager) {
            try {
              await this.tripRunManager.failTripRun(tripRunId, e, {
                mode_final: decision.mode,
                fallback_used: false,
                latency_ms: Date.now() - startTime,
              });
            } catch (error: any) {
              this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
            }
          }
          
          // 🆕 尝试从错误中提取部分决策日志（如果是状态机超时）
          let partialDecisionLog: DecisionLogEntry[] | undefined;
          if (decision.mode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
            this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果（需要状态机内部处理）`);
          }
          
          return this.buildFailureResponse(request, startTime, nf, {
            mode_final: decision.mode,
            fallback_used: false,
            deadline_ms: deadline.totalMs,
            time_remaining_ms: deadline.remainingMs(),
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
            this.modeLock.set(stabilityCtx, nextMode);
            
            // === 更新 TripRun 为 COMPLETED ===
            if (tripRunId && this.tripRunManager) {
              try {
                await this.tripRunManager.completeTripRun(tripRunId, {
                  mode_final: nextMode,
                  fallback_used: true,
                  latency_ms: Date.now() - startTime,
                });
              } catch (error: any) {
                this.logger.warn(`Failed to update TripRun to COMPLETED: ${error.message}`);
              }
            }
            
            return this.attachObservability(
              res,
              {
                mode_final: nextMode,
                fallback_used: true,
                deadline_ms: deadline.totalMs,
                time_remaining_ms: deadline.remainingMs(),
                breakers: {
                  sm: this.breakerSM.snapshot(),
                  dyn: this.breakerDyn.snapshot(),
                  legacy: this.breakerLegacy.snapshot(),
                },
                ...(tripRunId ? { durable_trip_run_id: tripRunId } : {}),
                ...(resumedCheckpoint ? { durable_checkpoint_loaded: true } : {}),
              },
              request,
            );
          } catch (e2: any) {
            // 标记 Circuit Breaker 失败
            if (nextMode === 'CLAUDE_SM') this.breakerSM.onFailure(e2);
            else if (nextMode === 'CLAUDE_DYNAMIC') this.breakerDyn.onFailure(e2);
            else this.breakerLegacy.onFailure(e2);
            continue;
          }
        }

        // 所有 fallback 都失败
        const nf = normalizeError(e);
        
        // === 更新 TripRun 为 FAILED ===
        if (tripRunId && this.tripRunManager) {
          try {
            await this.tripRunManager.failTripRun(tripRunId, e, {
              mode_final: finalMode,
              fallback_used: usedFallback,
              latency_ms: Date.now() - startTime,
            });
          } catch (error: any) {
            this.logger.warn(`Failed to update TripRun to FAILED: ${error.message}`);
          }
        }
        
        // 🆕 尝试提取部分决策日志
        let partialDecisionLog: DecisionLogEntry[] | undefined;
        if (finalMode === 'CLAUDE_SM' && e?.message?.startsWith('TIMEOUT:CLAUDE_SM')) {
          this.logger.warn(`[AgentService] 状态机超时，无法提取部分结果`);
        }
        
        return this.buildFailureResponse(request, startTime, nf, {
          mode_final: finalMode,
          fallback_used: usedFallback,
          deadline_ms: deadline.totalMs,
          time_remaining_ms: deadline.remainingMs(),
        }, partialDecisionLog);
      }
      // 理论上不可达：上面 success/fallback/failure 都应返回
      throw new Error('UNREACHABLE: routeAndRun fell through stability execution');
    } catch (error: any) {
      this.logger.error(`Agent service error: ${error?.message || String(error)}`, error?.stack);
      
      // === 更新 TripRun 为 FAILED（最外层 catch） ===
      if (tripRunId && this.tripRunManager) {
        try {
          await this.tripRunManager.failTripRun(tripRunId, error, {
            error_type: 'unhandled_exception',
            caught_at: 'routeAndRun_outer_catch',
          });
        } catch (updateError: any) {
          this.logger.warn(`Failed to update TripRun to FAILED in outer catch: ${updateError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * 映射状态状态到结果状态
   */
  private mapStateStatusToResultStatus(
    stateStatus: AgentState['result']['status']
  ): 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT' {
    const mapping: Record<AgentState['result']['status'], 'OK' | 'NEED_MORE_INFO' | 'NEED_CONSENT' | 'NEED_CONFIRMATION' | 'FAILED' | 'TIMEOUT'> = {
      READY: 'OK',
      DRAFT: 'NEED_MORE_INFO',
      NEED_MORE_INFO: 'NEED_MORE_INFO',
      NEED_CONSENT: 'NEED_CONSENT',
      SUSPENDED: 'NEED_CONFIRMATION', // 🕵️ HITL: SUSPENDED 映射到 NEED_CONFIRMATION
      FAILED: 'FAILED',
      TIMEOUT: 'TIMEOUT',
    };
    return mapping[stateStatus] || 'FAILED';
  }

  /**
   * 生成答案文本
   */
  private generateAnswerText(state: AgentState): string {
    if (state.result.status === 'READY') {
      if (state.result.timeline && state.result.timeline.length > 0) {
        return `已为您规划好行程，包含 ${state.result.timeline.length} 个节点。`;
      }
      return '处理完成。';
    }

    if (state.result.status === 'NEED_MORE_INFO') {
      return '需要更多信息才能完成规划，请提供日期、人数、城市或预算等信息。';
    }

    // 🕵️ HITL: 处理 SUSPENDED 状态
    if (state.result.status === 'SUSPENDED') {
      const suspensionInfo = state.result.suspensionInfo;
      if (suspensionInfo) {
        return `操作需要您的确认：${suspensionInfo.summary}。请查看审批请求（ID: ${suspensionInfo.approvalId}）。`;
      }
      return '操作需要您的确认，请查看审批请求。';
    }

    if (state.result.status === 'FAILED') {
      return '无法完成规划，请检查约束条件或联系客服。';
    }

    if (state.result.status === 'TIMEOUT') {
      return '处理超时，请稍后重试或简化请求。';
    }

    return '正在处理中...';
  }

  /**
   * 执行 System 2 Plan-and-Execute Agent
   * 
   * 使用 DAG Orchestrator 替代 ReAct 循环
   */
  private async executeSystem2PlanAndExecute(
    state: AgentState,
    budget: {
      max_seconds: number;
      max_steps: number;
      max_browser_steps: number;
    },
    request: RouteAndRunRequestDto,
  ): Promise<AgentState> {
    if (!this.dagOrchestrator) {
      throw new Error('DAGOrchestratorService 未可用');
    }

    this.logger.log(`[Agent] 使用 Plan-and-Execute Agent 执行 System2 任务`);

    try {
      // 1. 调用 DAG Orchestrator（传递 tripId 等上下文信息）
      const dagResult = await this.dagOrchestrator.run(
        state.request_id,
        request.message,
        {
          tripId: request.trip_id,
          userId: request.user_id,
          requestId: request.request_id,
        },
      );

      // 2. 将 DAG 结果转换回 AgentState
      const updatedState = this.convertDAGResultToAgentState(state, dagResult);

      // 3. 更新状态
      return this.stateService.update(state.request_id, updatedState);
    } catch (error: any) {
      this.logger.error(`Plan-and-Execute Agent 执行失败: ${error.message}`, error.stack);
      
      // 降级：标记为失败
      return this.stateService.update(state.request_id, {
        result: {
          ...state.result,
          status: 'FAILED',
          explanations: [
            ...(state.result.explanations || []),
            `Plan-and-Execute Agent 执行失败: ${error.message}`,
          ],
        },
      });
    }
  }

  /**
   * 将 DAG 编排结果转换回 AgentState
   */
  private convertDAGResultToAgentState(
    originalState: AgentState,
    dagResult: any,
  ): Partial<AgentState> {
    // 根据 DAG 结果更新 AgentState
    const explanations: string[] = [
      ...(originalState.result.explanations || []),
      dagResult.summary || 'Plan-and-Execute Agent 执行完成',
    ];

    // 从 memory 中提取关键信息
    const memoryKeys = Object.keys(dagResult.memory || {});
    const completedTasks = dagResult.plan?.filter((t: any) => t.status === 'completed') || [];

    // 构建解释
    if (completedTasks.length > 0) {
      explanations.push(`成功执行 ${completedTasks.length} 个任务`);
    }

    // 确定最终状态
    let finalStatus: AgentState['result']['status'] = 'READY';
    if (dagResult.status === 'failed') {
      finalStatus = 'FAILED';
    } else if (dagResult.status === 'timeout' || dagResult.status === 'deadlock') {
      finalStatus = 'TIMEOUT';
    } else if (dagResult.status === 'done') {
      finalStatus = 'READY';
    }

    // 检查是否有审批挂起
    const suspendedTask = dagResult.plan?.find((t: any) => 
      t.result && t.result.includes('SUSPENDED')
    );
    if (suspendedTask) {
      finalStatus = 'SUSPENDED';
    }

    // 扩展 memory（使用类型断言，因为 memory 类型是严格的）
    const updatedMemory = { ...originalState.memory };
    (updatedMemory as any).dagResult = {
      taskCount: dagResult.plan?.length || 0,
      completedCount: completedTasks.length,
      memoryKeys,
      status: dagResult.status,
    };

    return {
      result: {
        ...originalState.result,
        status: finalStatus,
        explanations,
      },
      memory: updatedMemory as typeof originalState.memory,
      observability: {
        ...originalState.observability,
        tool_calls: (originalState.observability.tool_calls || 0) + (dagResult.plan?.length || 0),
      },
    };
  }

  /**
   * 使用 Claude 编排的路由和执行
   */
  /**
   * 使用 Claude 编排（状态机版本）
   */
  private async routeAndRunWithClaudeStateMachine(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number; clamp: (ms: number) => number },
    tripRunId?: string | null,
    resumedCheckpoint?: TripRunDsoCheckpointPayload | null,
  ): Promise<RouteAndRunResponseDto> {
    this.logger.log(`[AgentService] 使用 Claude 状态机编排: request_id=${request.request_id}`);

    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未注入');
    }

    // 构建 AgentContext
    const context: AgentContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      conversationHistory: request.conversation_context?.recent_messages,
    };

      // Policy 预判定（与 Gate 合并见 deriveExternalVerdict）；失败不阻断主链
      let policyAction: PolicyAction | undefined;
      if (this.rlIntegration) {
        try {
          const pre = await this.rlIntegration.preDecision({
            requestId: request.request_id,
            tripId: request.trip_id || undefined,
            userRequest: request.message,
            action: 'route_and_run',
            params: {
              userId: request.user_id,
            },
          });
          policyAction = pre.action;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[AgentService] RL preDecision 跳过: ${msg}`);
        }
      }

      // 调用状态机编排（传递 deadline）
      this.logger.log(`[AgentService] 调用状态机编排: request_id=${request.request_id}, deadline=${deadline?.remainingMs() || 'N/A'}ms`);
      const orchestrationResult = await this.claudeOrchestrator.orchestrateWithStateMachine(
        request,
        context,
        deadline,
        resumedCheckpoint
          ? { decision_state: resumedCheckpoint.decision_state, checkpoint_loaded: true }
          : undefined,
      );

      if (
        tripRunId &&
        this.tripRunManager &&
        orchestrationResult.success &&
        orchestrationResult.result?.decisionState &&
        request.options?.persist_dso_checkpoint === true
      ) {
        await this.tripRunManager.saveDsoCheckpoint(tripRunId, {
          decision_state: orchestrationResult.result.decisionState,
          cursor_step: orchestrationResult.result.state?.current_step,
          saved_at: new Date().toISOString(),
        });
      }

      // 调试日志：记录状态机执行结果
      this.logger.log(`[AgentService] 状态机执行完成: success=${orchestrationResult.success}, decisionLog.length=${orchestrationResult.decisionLog?.length || 0}`);
      if (orchestrationResult.result?.state) {
        this.logger.log(`[AgentService] 状态机状态: current_step=${orchestrationResult.result.state.current_step}, decision_log.length=${orchestrationResult.result.state.decision_log?.length || 0}`);
      }

    // 构建响应（C1 strict: may throw; we optionally auto-heal for PT hard fact failures）
    const assembler = this.getResponseAssembler();

    const persist = (reqToPersist: RouteAndRunRequestDto, orc: any) => {
      this.persistRouteAndRunDecisionLogs({
        request: reqToPersist,
        orchestrationDecisionLog: orc?.result?.state?.decision_log,
      }).catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.debug(`[AgentService] persistRouteAndRunDecisionLogs skipped: ${msg}`);
      });
    };

    const assemble = (reqToAssemble: RouteAndRunRequestDto, orc: any) =>
      assembler.assembleClaudeStateMachineResponse({
        request: reqToAssemble,
        startTime,
        traceInfo,
        orchestrationResult: orc,
        policyAction,
        durableRun:
          tripRunId || resumedCheckpoint
            ? {
                trip_run_id: tripRunId ?? undefined,
                checkpoint_loaded: !!resumedCheckpoint,
              }
            : undefined,
      });

    // First attempt
    persist(request, orchestrationResult);
    try {
      return assemble(request, orchestrationResult);
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      const isC1Strict = /C1_STRICT_EVIDENCE_BUNDLE/.test(msg);
      const alreadyPtRetried =
        (request as any)?.meta?.pt_heal_retry === '1' || (request as any)?.meta?.pt_heal_retry === true;
      const alreadyWeatherRetried =
        (request as any)?.meta?.weather_heal_retry === '1' || (request as any)?.meta?.weather_heal_retry === true;

      const decisionLog = orchestrationResult?.result?.state?.decision_log ?? orchestrationResult?.decisionLog ?? [];
      const hasWeatherWindEvidence = (decisionLog as any[]).some((x) => {
        const ev = (x as any)?.metadata?.details?.evidence;
        const t = String(ev?.type ?? '').toLowerCase();
        return t === 'weather_physics' || String((x as any)?.metadata?.rule_id ?? '') === 'drive_safety_v1';
      });

      // Auto-heal Weather (Wind Lock): replan without driving; prefer indoor/hotel "stay in place".
      if (isC1Strict && hasWeatherWindEvidence && !alreadyWeatherRetried && this.claudeOrchestrator) {
        this.logger.warn(`[AgentService] C1 strict failed, attempting WEATHER sentinel replan: ${msg}`);
        const patchedRequest: RouteAndRunRequestDto = {
          ...request,
          message:
            `${request.message}\n` +
            `[CONSTRAINT_ZONE] Driving is not allowed due to extreme wind safety constraints (drive_safety_v1). ` +
            `Prefer rail/ferry over driving if you must relocate; otherwise prefer staying in place (ACCOMMODATION/REST) or indoor POIs. ` +
            `Assume roads may be unsafe while rail can remain operational.`,
          meta: { ...(request.meta ?? {}), weather_heal_retry: '1' } as any,
          emergency_constraints: {
            ...(request.emergency_constraints ?? {}),
            reason_code: 'HEALING_DRIVE_SAFETY_FAILED',
          },
        };
        const healed = await this.claudeOrchestrator.orchestrateWithStateMachine(
          patchedRequest,
          context,
          deadline,
          resumedCheckpoint
            ? { decision_state: resumedCheckpoint.decision_state, checkpoint_loaded: true }
            : undefined,
        );
        persist(patchedRequest, healed);
        return assemble(patchedRequest, healed);
      }

      // Auto-heal PT hard failures: replan without PUBLIC TRANSIT.
      if (isC1Strict && !alreadyPtRetried && this.claudeOrchestrator) {
        this.logger.warn(`[AgentService] C1 strict failed, attempting PT auto-heal replan: ${msg}`);
        const patchedRequest: RouteAndRunRequestDto = {
          ...request,
          message:
            `${request.message}\n` +
            `[CONSTRAINT_ZONE] Public transit is not allowed (PT hard evidence failed). ` +
            `Re-route using DRIVE/taxi or adjust stay location.`,
          meta: { ...(request.meta ?? {}), pt_heal_retry: '1' } as any,
          emergency_constraints: {
            ...(request.emergency_constraints ?? {}),
            reason_code: 'HEALING_PT_HARD_FACT_FAILED',
          },
        };
        const healed = await this.claudeOrchestrator.orchestrateWithStateMachine(
          patchedRequest,
          context,
          deadline,
          resumedCheckpoint
            ? { decision_state: resumedCheckpoint.decision_state, checkpoint_loaded: true }
            : undefined,
        );
        persist(patchedRequest, healed);
        return assemble(patchedRequest, healed);
      }
      throw e;
    }
  }

  private async routeAndRunWithClaude(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number; clamp: (ms: number) => number },
  ): Promise<RouteAndRunResponseDto> {
    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未可用');
    }

    try {
      // 构建 Agent 上下文
      const context: AgentContext = {
        requestId: request.request_id,
        userId: request.user_id,
        tripId: request.trip_id,
        conversationHistory: request.conversation_context?.recent_messages,
        userPreferences: {},
      };

      // 使用 Claude 编排（传递 deadline）
      const orchestrationResult = await this.claudeOrchestrator.orchestrate(request, context, deadline);

      const assembler = this.getResponseAssembler();

      const route = orchestrationResult.result?.routingDecision?.route || RouteType.SYSTEM2_REASONING;
      const isSystem1 = route.startsWith('SYSTEM1');
      let system1Result: { success: boolean; answerText?: string; result?: any } | undefined;
      if (isSystem1 && orchestrationResult.success) {
        this.logger.debug(`[AgentService] Claude 编排返回 System 1 路径: ${route}`);
        const tempState = this.stateService.createInitialState(
          request.message,
          request.user_id,
          request.trip_id,
          request.options,
        );
        const r = await this.system1Executor.execute(route as RouteType, tempState);
        system1Result = { success: r.success, answerText: r.answerText ?? undefined, result: r.result };
      }

      return assembler.assembleClaudeDynamicResponse({
        request,
        startTime,
        traceInfo,
        orchestrationResult,
        system1Result,
      });
    } catch (error: any) {
      this.logger.error(`[AgentService] Claude 编排失败: ${error?.message || String(error)}`, error?.stack);
      
      // 降级到原有逻辑
      this.logger.warn('[AgentService] Claude 编排失败，降级使用原有路由逻辑');
      // 移除 Feature Flag，重新执行原有逻辑
      const fallbackRequest = {
        ...request,
        options: {
          ...request.options,
          use_claude_orchestration: false,
        },
      };
      return this.routeAndRun(fallbackRequest);
    }
  }

  /**
   * 判断是否是修改类请求
   * 
   * 注意：这个判断可能不够准确，建议：
   * 1. 使用 LLM 进行更准确的意图识别（但会增加延迟）
   * 2. 基于用户反馈持续优化关键词列表
   * 3. 考虑使用机器学习模型
   */
  private isModificationRequest(message: string): boolean {
    const messageLower = message.toLowerCase().trim();
    
    // 修改类关键词（中文）
    const modificationKeywordsCN = [
      '修改', '删除', '添加', '更新', '调整', '变更', '替换', '移除',
      '增加', '减少', '编辑', '改动', '更改',
    ];
    
    // 修改类关键词（英文）
    const modificationKeywordsEN = [
      'modify', 'delete', 'remove', 'add', 'update', 'change', 'adjust', 'edit',
      'replace', 'insert', 'append', 'drop', 'alter',
    ];
    
    // 检查是否包含修改类关键词
    const hasModificationKeyword = [
      ...modificationKeywordsCN,
      ...modificationKeywordsEN,
    ].some(keyword => messageLower.includes(keyword));
    
    // 排除查询类表达（避免误判）
    const queryKeywords = [
      '查询', '查看', '显示', '展示', '了解', '知道', '看看',
      'query', 'show', 'display', 'view', 'see', 'check', 'get',
    ];
    
    const hasQueryKeyword = queryKeywords.some(keyword => messageLower.includes(keyword));
    
    // 如果同时包含查询和修改关键词，根据位置判断意图
    if (hasQueryKeyword && hasModificationKeyword) {
      // 检查查询关键词是否在修改关键词之前（更可能是查询意图）
      const queryIndices = queryKeywords.map(k => messageLower.indexOf(k)).filter(i => i >= 0);
      const modIndices = [...modificationKeywordsCN, ...modificationKeywordsEN]
        .map(k => messageLower.indexOf(k)).filter(i => i >= 0);
      
      if (queryIndices.length > 0 && modIndices.length > 0) {
        const queryIndex = Math.min(...queryIndices);
        const modIndex = Math.min(...modIndices);
        if (queryIndex < modIndex) {
          return false; // 查询意图更强（查询关键词在前）
        } else {
          return true; // 修改意图更强（修改关键词在前）
        }
      }
    }
    
    return hasModificationKeyword && !hasQueryKeyword;
  }

  // 入口短路响应已迁入 AgentEntryResponseFactoryService

  /**
   * LEGACY 模式执行（集成稳定化层）
   */
  private async routeAndRunLegacy(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo?: { orchestration: any; timestamp: string },
    deadline?: { remainingMs: () => number },
  ): Promise<RouteAndRunResponseDto> {
    // 检查 deadline
    if (deadline && deadline.remainingMs() <= 0) {
      throw new Error('TIMEOUT:LEGACY_DEADLINE');
    }

    // 原有的 LEGACY 逻辑（从 routeAndRun 中提取）
    // 1. 创建初始状态
    const initialState = this.stateService.createInitialState(
      request.message,
      request.user_id,
      request.trip_id,
      request.options
    );

    // 2. 路由决策
    const routerStartTime = Date.now();
    const routeOutput = await this.router.route(
      request.message,
      {
        tripId: request.trip_id,
        recentMessages: request.conversation_context?.recent_messages,
        userId: request.user_id,
      },
      initialState.request_id
    );
    const routerMs = Date.now() - routerStartTime;

    // 更新状态
    let state = this.stateService.update(initialState.request_id, {
      observability: {
        ...initialState.observability,
        router_ms: routerMs,
      },
    });

    // 3. 检查 webbrowse 授权
    if (routeOutput.route === RouteType.SYSTEM2_WEBBROWSE && !request.options?.allow_webbrowse) {
      routeOutput.route = RouteType.SYSTEM2_REASONING;
      routeOutput.confidence = 0.7;
      routeOutput.reasons = [RouterReason.NO_API];
      routeOutput.consent_required = false;
    }

    // 4. 根据路由执行
    let result: any;
    let answerText = '';

    if (routeOutput.route.startsWith('SYSTEM1')) {
      const system1Result = await this.system1Executor.execute(routeOutput.route, state);
      result = system1Result.result;
      answerText = system1Result.answerText ?? '';
      state = this.stateService.update(state.request_id, {
        result: {
          ...state.result,
          status: system1Result.success ? 'READY' : 'NEED_MORE_INFO',
        },
      });
    } else {
      if (this.dagOrchestrator) {
        state = await this.executeSystem2PlanAndExecute(state, routeOutput.budget, request);
      } else {
        this.logger.warn('DAGOrchestratorService 未可用，降级使用 ReAct 循环');
        state = await this.orchestrator.execute(state, routeOutput.budget);
      }
      
      result = {
        timeline: state.result.timeline,
        dropped_items: state.result.dropped_items,
        candidates: [],
        evidence: [],
        robustness: state.compute.robustness,
      };
      answerText = this.generateAnswerText(state);
    }

    // 5. 计算 token 数量
    const tokensEst = TokenCalculator.estimateTotalTokens(
      request.message,
      answerText,
      {
        route: routeOutput,
        result: result,
        state: {
          trip: state.trip,
          memory: state.memory,
          compute: state.compute,
          result: state.result,
        },
      }
    );

    // 6. 构建响应
    const latency = Date.now() - startTime;
    const response: RouteAndRunResponseDto = {
      request_id: request.request_id,
      route: routeOutput,
      result: {
        status: this.mapStateStatusToResultStatus(state.result.status),
        answer_text: answerText,
        payload: {
          ...result,
          ...(state.result.status === 'SUSPENDED' && state.result.suspensionInfo
            ? { suspensionInfo: state.result.suspensionInfo }
            : {}),
        },
      },
      explain: {
        decision_log: state.react.decision_log.map(log => ({
          request_id: state.request_id,
          step: 'DONE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
          outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            step_number: log.step,
            facts: log.facts,
            policy_id: log.policy_id,
          },
        })),
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: this.getResponseAssembler().buildSimplifiedExplanation(
          state.react.decision_log.map(log => ({
            request_id: state.request_id,
            step: 'DONE' as OrchestrationStep,
            actor: 'Orchestrator' as SubAgentType,
            inputs_summary: `Action: ${log.chosen_action}, Reason: ${log.reason_code}`,
            outputs_summary: `执行了 ${log.chosen_action}，策略: ${log.policy_id}`,
            evidence_refs: [],
            timestamp: new Date().toISOString(),
          })),
          undefined
        ),
      },
      observability: {
        latency_ms: latency,
        router_ms: routerMs,
        system_mode: routeOutput.route.startsWith('SYSTEM1') ? 'SYSTEM1' : 'SYSTEM2',
        tool_calls: state.observability.tool_calls,
        browser_steps: state.observability.browser_steps,
        tokens_est: tokensEst,
        cost_est_usd: state.observability.cost_est_usd,
        fallback_used: state.observability.fallback_used,
        trace: traceInfo || {
          orchestration: {
            resolved: {
              mode: 'LEGACY',
              reason: 'Claude orchestration disabled, using legacy routing',
              matchedRules: ['legacy_fallback'],
            },
          },
          timestamp: new Date().toISOString(),
          orchestration_mode: 'LEGACY',
        },
      },
    };

    // 缓存响应（用于请求去重）
    if (this.requestDeduplication && !request.options?.dry_run) {
      const requestHash = this.requestDeduplication.generateRequestHash(request);
      this.requestDeduplication.cacheResponse(requestHash, response);
    }

    // 记录 agent_complete 事件
    if (this.eventTelemetry) {
      this.eventTelemetry.recordAgentComplete(
        request.request_id,
        response.result.status,
        latency,
        tokensEst,
        state.observability.cost_est_usd,
        {
          route: routeOutput.route,
          system_mode: response.observability.system_mode,
          tool_calls: response.observability.tool_calls,
          browser_steps: response.observability.browser_steps,
        }
      );
    }

    return response;
  }

  /**
   * 构建失败响应（标准化错误映射）
   */
  /**
   * 将 DSO.travelOntologyState 与编排 state 推导值合并后透出给 route_and_run payload。
   */
  private resolveTravelOntologyForPayload(
    result: unknown,
  ): DecisionState['travelOntologyState'] | undefined {
    if (!result || typeof result !== 'object') return undefined;
    const r = result as { state?: OrchestratorState; decisionState?: DecisionState };
    const fromDso = r.decisionState?.travelOntologyState;
    const fromOs = r.state ? buildTravelOntologyStateFromOrchestrator(r.state) : undefined;
    if (!fromDso) return fromOs;
    if (!fromOs) return fromDso;
    return mergeTravelOntologyState(fromDso, fromOs) ?? fromDso;
  }

  private buildFailureResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    nf: { status: string; errorType: string; message: string; isTimeout: boolean },
    obs: any,
    partialDecisionLog?: DecisionLogEntry[], // 🆕 部分决策日志（超时等情况）
  ): RouteAndRunResponseDto {
    const receivedRouteDirectionId = this.resolveRequestRouteDirectionId(request);
    return {
      request_id: request.request_id,
        route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.1,
        reasons: [RouterReason.MISSING_INFO],
        required_capabilities: [],
        consent_required: false,
        budget: {
          max_seconds: Math.round((obs.deadline_ms ?? 12000) / 1000),
          max_steps: 0,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: nf.status === 'TIMEOUT' ? UIStatus.FAILED : UIStatus.FAILED,
          message: nf.message,
        },
      },
      result: {
        status: nf.status as any,
        answer_text: nf.message,
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          needsUserConfirmation: nf.status === 'NEED_CONFIRMATION' || nf.status === 'NEED_MORE_INFO',
          clarificationMessage: nf.message,
          errorType: (nf.isTimeout ? ErrorType.TIMEOUT_ERROR : ErrorType.UNKNOWN_ERROR) as ErrorType,
        },
      },
      explain: {
        decision_log: partialDecisionLog || [], // 🆕 使用部分决策日志（如果有）
        // 🆕 生成简化版解释（减少认知负荷）
        simplified_explanation: undefined, // 失败情况不生成简化版解释
      },
        observability: {
        latency_ms: Date.now() - startTime,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: Boolean(obs.fallback_used),
        orchestration_mode_final: obs?.mode_final,
        received_route_direction_id: receivedRouteDirectionId,
        trace: {
          orchestration: {
            resolved: {
              mode: obs.mode_final || 'LEGACY',
              reason: `Failed with error: ${nf.errorType}`,
              matchedRules: ['stability_layer_failure'],
            },
          },
          timestamp: new Date().toISOString(),
          // @ts-ignore - 扩展 trace 以包含稳定化层信息
          deadline_ms: obs.deadline_ms,
          time_remaining_ms: obs.time_remaining_ms,
          mode_final: obs.mode_final,
        } as any,
      },
    };
  }

  private resolveRequestRouteDirectionId(
    request?: RouteAndRunRequestDto,
  ): string | undefined {
    if (!request) return undefined;
    const snake = (request as any)?.route_direction_id;
    const camel = (request as any)?.routeDirectionId;
    const v =
      (typeof snake === 'string' ? snake : undefined) ??
      (typeof camel === 'string' ? camel : undefined);
    const trimmed = typeof v === 'string' ? v.trim() : '';
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private attachObservability(
    resp: RouteAndRunResponseDto,
    obs: any,
    request?: RouteAndRunRequestDto,
  ): RouteAndRunResponseDto {
    if (!resp) return resp;
    const receivedRouteDirectionId = this.resolveRequestRouteDirectionId(request);
    resp.observability = {
      ...(resp.observability ?? {}),
      ...obs,
    };
    if (resp.observability && obs?.mode_final && !('orchestration_mode_final' in resp.observability)) {
      (resp.observability as any).orchestration_mode_final = obs.mode_final;
    }
    if (
      resp.observability &&
      receivedRouteDirectionId &&
      !('received_route_direction_id' in resp.observability)
    ) {
      (resp.observability as any).received_route_direction_id = receivedRouteDirectionId;
    }
    // 与 CLI `--show-poi-trace` 对齐：把稳定化层证据同步进 payload.poiTrace
    const omf =
      (resp.observability as any).orchestration_mode_final ?? obs?.mode_final;
    const rid =
      (resp.observability as any).received_route_direction_id ??
      receivedRouteDirectionId;
    const payloadAny = resp.result?.payload as Record<string, unknown> | undefined;
    const pt = payloadAny?.poiTrace;
    if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
      payloadAny.poiTrace = {
        ...(pt as Record<string, unknown>),
        ...(omf ? { orchestration_mode_final: omf } : {}),
        ...(rid
          ? {
              received_route_direction_id: rid,
              requestRouteDirectionId: rid,
            }
          : {}),
      };
    }
    return resp;
  }

  // AI 能力展示已迁入 ResponseAssembler（AgentService 不再直接生成）
}

