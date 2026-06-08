// src/agent/services/agent.service.ts
import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import {
  TripRunManagerService,
  type TripRunDsoCheckpointPayload,
} from './trip-run-manager.service';
import {
  buildPendingItineraryAdjustDraft,
  PENDING_ITINERARY_ADJUST_DRAFT_META_KEY,
} from '../utils/itinerary-adjust-pending-draft.util';
import { TripTaskMemoryService } from '../context-engine/services/trip-task-memory.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import { ContextSlidingWindowAdapter } from '../context/services/context-sliding-window-adapter.service';
import { TokenCalculator } from '../utils/token-calculator.util';
import {
  AgentContext,
  type OrchestrationResult,
  type RecoveryInvocationContext,
} from '../interfaces/claude-orchestration.interface';
import {
  signalsFromRequest,
  routingSignalsWithResolvedTaskType,
  shouldRouteBoundTripAsItineraryAdjust,
  type RoutingSignals,
  type TaskType,
} from '../utils/orchestration-signals.util';
import {
  OrchestrationStep,
  SubAgentType,
  DecisionLogEntry,
  OrchestratorState,
} from '../interfaces/trip-plan.interface';
import { type PolicyAction } from '../utils/external-verdict.util';
import { RLIntegrationService } from '../training/services/rl-integration.service';
import {
  CircuitBreaker,
  createDeadline,
  ModeLock,
  OrchestrationMode,
  withTimeout,
} from './orchestration-stability.util';
import { ErrorType } from '../interfaces/error-types.interface';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { buildTravelOntologyStateFromOrchestrator, mergeTravelOntologyState } from '../../decision/kernel/travel-ontology.mapper';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import type { ReplayProvenance } from '../contracts/replay-provenance.types';
import { buildRuntimeExecutionProfileDedupReplay } from '../utils/runtime-execution-profile.builder';
import { replayLifecycleManager } from '../utils/replay-lifecycle.manager';
import { attachFullResponseReplayArtifactDescriptor } from '../utils/replay-artifact-descriptor.builder';
import { ExecutionGatewayService } from './execution-gateway.service';
import { RouteAndRunAsyncDelegationService } from './route-and-run-async-delegation.service';
import { attachFreshRuntimeMaterialization } from '../runtime/fresh-runtime-adapter.util';
import { RuntimeReplayPersistenceService } from './runtime-replay-persistence.service';
import { buildRuntimeExecutionProfileLegacyAssembly } from '../utils/runtime-execution-profile.builder';
import { mergeRuntimeExecutionAnomaliesByCode } from '../utils/runtime-execution-profile.validation';
import type { RuntimeExecutionProfile } from '../contracts/runtime-execution-profile.types';
import type { RuntimeExecutionAnomaly } from '../contracts/runtime-execution-profile.validation.types';
import { sortFailureReasonCodes } from '../constants/failure-reason-codes.constants';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import { TravelTimeRouterService } from './travel-time-router.service';
import { TravelTimeResolverService, type TravelTimeEdgeContext } from './travel-time-resolver.service';
import { AccessTrackerService } from '../../skills/world/services/access-tracker.service';
import type { TravelTimeEvidenceLineageDto } from '../dto/evidence-lineage.dto';
import { NegotiationSessionStoreService } from './negotiation-session-store.service';
import { NegotiationResolverService } from './negotiation-resolver.service';
import type { ConfirmNegotiationResponseDto, NegotiationResolutionDto } from '../dto/confirm-negotiation.dto';
import { AgentEntryResponseFactoryService } from './agent-entry-response-factory.service';
import { GovernanceLedgerStoreService } from '../ledger/governance-ledger.store.service';
import { PlanningRequestClassifierService } from './planning-request-classifier.service';
import { ModuleRef } from '@nestjs/core';
import type { DecisionLogEntry as TripsDecisionLogEntry } from '../../trips/decision/shared/decision-result.types';
import type { DecisionStage as TripsDecisionStage } from '../../trips/decision/shared/decision-result.types';
import type { DecisionPersona as TripsDecisionPersona } from '../../trips/decision/shared/decision-result.types';
import { isCriticalDecisionActionValue } from '../../trips/decision/shared/decision-log-metadata-prd.types';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { EvidenceCacheService } from '../../skills/world/services/evidence-cache.service';
import { TimelineInspectorService } from './timeline-inspector.service';
import { ItineraryVersionService } from './itinerary-version.service';
import { ItineraryRevisionTimelineService } from './itinerary-revision-timeline.service';
import type { RevisionTimelineResponseDto } from '../dto/itinerary-revision-timeline.dto';
import { ItineraryRollbackService } from './itinerary-rollback.service';
import { ItineraryRevisionRegretService } from './itinerary-revision-regret.service';
import { UserPreferenceLearningService } from './user-preference-learning.service';
import { PreferenceEvolutionService } from './preference-evolution.service';
import type { ItineraryRollbackRequestDto, ItineraryRollbackResponseDto } from '../dto/itinerary-rollback.dto';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from '../axioms/axiom-matchers';
import {
  axiomMatchSourceForMetrics,
  normalizeAxiomCidForMetrics,
} from '../axioms/axiom-prometheus.util';
import { AuditReportGenerator } from '../utils/terminal-audit-report.generator';
import { LogDecisionRequestDto } from '../dto/log-decision.dto';
import { RouteAndRunContextEnricherService } from './route-and-run-context-enricher.service';
import { UserStandingPreferenceService } from './user-standing-preference.service';
import { mapOrchestrationDecisionLogToTrips } from '../utils/orchestration-to-trips-decision-log.util';
import {
  toOrchestrationFailureObservability,
  type OrchestratorRobustnessMetadata,
} from '../utils/orchestrator-failure-taxonomy.util';
import {
  resolveExecutionRecoveryPlan,
  type ExecutionRecoveryPlan,
} from '../../chain-of-work/execution/execution-recovery-policy.util';
import type { ExecutionIntegrationService } from '../../chain-of-work/execution/execution-integration.service';
import { ConfigService } from '@nestjs/config';
import {
  McpAgentExecutorService,
  resolveAgenticMcpRetryBudget,
} from '../assistants/planning-assistant/services/mcp-agent-executor.service';
import type { McpAgentExecutorRunResult } from '../assistants/planning-assistant/services/mcp-agent-executor.service';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import { isWorkbenchAssistantPlaceholderMessage } from '../utils/trip-plan-intake-message.util';
import type { Skill } from '../../skills/interfaces/skill.interface';
import { SKILL_INTENT_RECOGNIZE } from '../../skills/skills.tokens';
import {
  inferDefaultAgenticToolPacks,
  isInfrastructureFastTrackCandidate,
  parseAgenticToolLoopFlag,
  parseAgenticToolPacksEnv,
  parseFeatureTaskClosureBooking,
  parseAgenticRuntimeMcpCapFlag,
} from '../utils/agentic-tool-loop-dispatch.util';
import { deriveAgenticMcpRuntimeAllowlist, extractAgenticSkillAllowlistForMcpCap } from '../runtime/agentic-mcp-runtime-cap.util';
import {
  mergeAgenticToolPolicies,
  mergeApprovedToolInvocations,
  parseAgenticGovernanceHitlFlag,
} from '../runtime/agentic-tool-governance.util';
import type { ConflictStrategyOptionsResponseDto } from '../dto/conflict-strategy-options.dto';
import { StrategyConflictOptionsService } from './strategy-conflict-options.service';
import { MemoryContextAssemblerService } from '../memory/services/memory-context-assembler.service';
import { RouteRunRequestFitnessHydratorService } from '../memory/services/route-run-request-fitness-hydrator.service';
import { RouteRunIcelandMarketPriorHydratorService } from '../memory/services/route-run-iceland-market-prior-hydrator.service';
import type { AgentMemoryContext } from '../memory/interfaces/agent-memory-context.interface';
import { AgentMemoryContextStore } from '../memory/context/agent-memory-context.store';
import { MemorySnapshotPersistenceService } from '../memory/persistence/memory-snapshot-persistence.service';
import { LedgerRecomputeExecutorService } from '../memory/decision-ledger/ledger-recompute-executor.service';
import { IncrementalRecomputeOrchestratorService } from '../memory/decision-ledger/incremental-recompute-orchestrator.service';
import { AgentExecutionContextStore } from '../runtime/agent-execution-context.store';
import { AgentExecutionContextFactoryService } from '../runtime/agent-execution-context-factory.service';
import { DecisionOsContextAssemblerService } from '../runtime/decision-os-context-assembler.service';
import { DecisionOsExecutionContextStore } from '../runtime/decision-os-execution-context.store';
import { DecisionRuntimeKernelService } from '../runtime/decision-runtime-kernel.service';
import { ExecutionTimelineRecorderService } from '../runtime/execution-timeline-recorder.service';
import {
  assertExecutionGatewayPostReturnContract,
  ExecutionGatewayContractViolation,
} from './execution-gateway-trace-contract.enforcement';
import {
  buildReplayProfileFromTrace,
  mergeReplayProfileIntoRouteAndRunRequest,
} from '../contracts/orchestration-replay-from-trace';
import { buildExecutionContractGovernanceEchoV1 } from '../contracts/execution-gateway-contract-governance.v1';
import {
  parseChangeImpactDescriptorV1,
  serializeChangeImpactDescriptorForCompare,
} from '../contracts/execution-os-change-impact-descriptor.v1';
import { executionTimelineInputHash } from '../runtime/execution-timeline-hash.util';
import { ReplayFromTraceRequestDto } from '../dto/replay-from-trace.dto';
import { randomUUID } from 'crypto';

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
    private readonly contextSlidingWindow: ContextSlidingWindowAdapter,
    private memoryContextAssembler: MemoryContextAssemblerService,
    private agentMemoryContextStore: AgentMemoryContextStore,
    private agentExecutionContextFactory: AgentExecutionContextFactoryService,
    private agentExecutionContextStore: AgentExecutionContextStore,
    @Inject(forwardRef(() => ExecutionGatewayService))
    private executionGateway: ExecutionGatewayService,
    @Optional() private readonly decisionOsContextAssembler?: DecisionOsContextAssemblerService,
    @Optional() private readonly decisionOsExecutionContextStore?: DecisionOsExecutionContextStore,
    @Optional() private readonly decisionRuntimeKernel?: DecisionRuntimeKernelService,
    @Optional() private readonly executionTimelineRecorder?: ExecutionTimelineRecorderService,
    @Optional() private readonly memorySnapshotPersistence?: MemorySnapshotPersistenceService,
    @Optional() private readonly ledgerRecomputeExecutor?: LedgerRecomputeExecutorService,
    @Optional() private readonly incrementalRecomputeOrchestrator?: IncrementalRecomputeOrchestratorService,
    @Optional() private dagOrchestrator?: DAGOrchestratorService,
    @Optional() private claudeOrchestrator?: ClaudeOrchestratorService,
    private eventTelemetry?: EventTelemetryService,
    private requestDeduplication?: RequestDeduplicationService,
    @Optional() private tripRunManager?: TripRunManagerService,
    @Optional() private tripTaskMemory?: TripTaskMemoryService,
    @Optional() private rlIntegration?: RLIntegrationService,
    @Optional() private responseAssembler?: RouteAndRunResponseAssemblerService,
    @Optional() private entryResponses?: AgentEntryResponseFactoryService,
    @Optional() private planningRequestClassifier?: PlanningRequestClassifierService,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private negotiationSessions?: NegotiationSessionStoreService,
    @Optional() private negotiationResolver?: NegotiationResolverService,
    @Optional() private evidenceCache?: EvidenceCacheService,
    @Optional() private timelineInspector?: TimelineInspectorService,
    @Optional() private travelTimeRouter?: TravelTimeRouterService,
    @Optional() private readonly accessTracker?: AccessTrackerService,
    @Optional() private readonly travelTimeResolver?: TravelTimeResolverService,
    @Optional() private readonly tradeoffEngine?: TradeoffEngineService,
    @Optional() private readonly itineraryVersion?: ItineraryVersionService,
    @Optional() private readonly itineraryRevisionTimeline?: ItineraryRevisionTimelineService,
    @Optional() private readonly itineraryRollback?: ItineraryRollbackService,
    @Optional() private readonly itineraryRevisionRegret?: ItineraryRevisionRegretService,
    @Optional() private readonly userPreferenceLearning?: UserPreferenceLearningService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
    @Optional() private readonly routeContextEnricher?: RouteAndRunContextEnricherService,
    @Optional() private readonly userStandingPreference?: UserStandingPreferenceService,
    /** Phase B+：编排失败恢复策略（退避 / 澄清分流） */
    @Optional() private readonly executionIntegration?: ExecutionIntegrationService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly mcpAgentExecutor?: McpAgentExecutorService,
    @Optional() private readonly strategyConflictOptions?: StrategyConflictOptionsService,
    @Optional() private readonly runtimeReplayPersistence?: RuntimeReplayPersistenceService,
    @Optional() private readonly governanceLedgerStore?: GovernanceLedgerStoreService,
    @Optional() @Inject(SKILL_INTENT_RECOGNIZE) private readonly intentRecognizeSkill?: Skill,
    @Optional() private readonly routeRunRequestFitnessHydrator?: RouteRunRequestFitnessHydratorService,
    @Optional() private readonly routeRunIcelandMarketPriorHydrator?: RouteRunIcelandMarketPriorHydratorService,
    @Optional() private readonly routeAndRunAsyncService?: import('./route-and-run-async.service').RouteAndRunAsyncService,
    @Optional() private readonly routeAndRunAsyncTaskStore?: import('./route-and-run-async-task.store').RouteAndRunAsyncTaskStore,
    @Optional()
    @Inject(forwardRef(() => RouteAndRunAsyncDelegationService))
    private readonly routeAndRunAsyncDelegationService?: RouteAndRunAsyncDelegationService,
  ) {}

  /**
   * route_and_run：在 Memory snapshot 冻结前，按 user_id 即时拉取体能画像并写回 request / memory（请求级，不落 L1）。
   */
  async hydrateRequestFitnessIfNeeded(request: RouteAndRunRequestDto, memory: AgentMemoryContext): Promise<void> {
    if (this.routeRunRequestFitnessHydrator) {
      await this.routeRunRequestFitnessHydrator.hydrate(request, memory);
    }
    if (this.routeRunIcelandMarketPriorHydrator) {
      this.routeRunIcelandMarketPriorHydrator.hydrate(request, memory);
    }
  }

  private isValidIntentTaskType(x: string): x is TaskType {
    return (
      x === 'TRIP_PLANNING' ||
      x === 'CRUD' ||
      x === 'DATA_LOOKUP' ||
      x === 'CUSTOMER_SUPPORT' ||
      x === 'RAG_QA' ||
      x === 'BOOKING_WORKFLOW' ||
      x === 'GENERIC_QA'
    );
  }

  /**
   * 路由信号：先做关键词规则推断，再可选用 `intent.recognize` 覆盖 taskType，避免每次为新语种/句式改规则。
   */
  private async resolveRoutingSignals(request: RouteAndRunRequestDto): Promise<RoutingSignals> {
    const base = signalsFromRequest(request);
    if (shouldRouteBoundTripAsItineraryAdjust(request.trip_id, request.message ?? '')) {
      if (base.taskType !== 'TRIP_PLANNING') {
        this.logger.log(
          `[AgentService] bound trip ITINERARY_ADJUST → TRIP_PLANNING（规则原为 ${base.taskType}）request_id=${request.request_id}`,
        );
      }
      return base.taskType === 'TRIP_PLANNING'
        ? base
        : routingSignalsWithResolvedTaskType(request, 'TRIP_PLANNING');
    }
    const mode = request.options?.intent_mode;
    if (mode && mode !== 'AUTO') {
      return base;
    }
    if (request.options?.enable_intent_recognition_skill === false) {
      return base;
    }
    if (process.env.DISABLE_INTENT_RECOGNIZE_SKILL === '1') {
      return base;
    }
    if (!this.intentRecognizeSkill) {
      return base;
    }
    const maxSec = Number(request.options?.max_seconds ?? 30);
    if (maxSec < 10) {
      return base;
    }

    try {
      const out = (await this.intentRecognizeSkill.execute({
        message: request.message,
        trip_id: request.trip_id,
        rule_based_task_type: base.taskType,
        recent_messages: this.contextSlidingWindow.slice(
          'agent_telemetry',
          request.conversation_context?.recent_messages,
        ),
        tokenContext: {
          request_id: request.request_id,
          state_machine_step: 'INTAKE',
          sub_agent: 'Planner',
        },
      })) as {
        taskType?: TaskType;
        confidence?: number;
        reasoning?: string;
      };
      const conf = typeof out.confidence === 'number' ? out.confidence : 0;
      const tt = out.taskType;
      if (conf >= 0.52 && tt && this.isValidIntentTaskType(tt)) {
        const ruleKeptForTripConsultation =
          request.trip_id?.trim() &&
          (base.taskType === 'DATA_LOOKUP' ||
            base.taskType === 'GENERIC_QA' ||
            base.taskType === 'RAG_QA') &&
          tt === 'TRIP_PLANNING';
        if (ruleKeptForTripConsultation) {
          this.logger.log(
            `[AgentService] intent.recognize 建议 TRIP_PLANNING，但规则已为 ${base.taskType}（已绑定 trip）；保留规则结果 confidence=${conf.toFixed(2)} request_id=${request.request_id}`,
          );
          return base;
        }
        if (tt !== base.taskType) {
          this.logger.log(
            `[AgentService] intent.recognize: taskType ${base.taskType} -> ${tt} (confidence=${conf.toFixed(2)})`,
          );
        }
        return routingSignalsWithResolvedTaskType(request, tt);
      }
    } catch (e: any) {
      this.logger.warn(`[AgentService] intent.recognize 调用失败，保留规则推断: ${e?.message ?? e}`);
    }
    return base;
  }

  /**
   * UI「决策对话」路径：基于 MAC 快照生成冲突说明与 2–3 条对齐策略（规则模板）。
   * 与 route_and_run 独立，供前端在检测到 strategy 冲突时调用。
   */
  getConflictStrategyOptions(tripId: string): ConflictStrategyOptionsResponseDto {
    return (
      this.strategyConflictOptions?.buildOptions(tripId) ?? {
        explanation_zh: '策略冲突模块未启用。',
        options: [],
        consensus_summary: null,
        open_conflict_count: 0,
      }
    );
  }

  /** 与 ExecutionIntegrationService 对齐；未注入时退回纯函数实现 */
  private resolveRecoveryPlanMeta(meta: OrchestratorRobustnessMetadata): ExecutionRecoveryPlan | null {
    const env = process.env;
    return this.executionIntegration?.resolveRecoveryPlan(meta, env) ?? resolveExecutionRecoveryPlan(meta, env);
  }

  /** 主编排路径在本请求内「放弃」时再记一次熔断失败；Recovery 环内重试不计入（避免单次请求耗尽全局阈值）。 */
  private recordPrimaryOrchestrationBreakerFailure(mode: OrchestrationMode, err: any): void {
    if (mode === 'CLAUDE_SM') this.breakerSM.onFailure(err);
    else if (mode === 'CLAUDE_DYNAMIC') this.breakerDyn.onFailure(err);
    else this.breakerLegacy.onFailure(err);
  }

  private async appendRecoveryAuditSafe(tripRunId: string | null, payload: Record<string, unknown>): Promise<void> {
    if (!tripRunId || !this.tripRunManager) return;
    try {
      await this.tripRunManager.appendRecoveryAuditEntry(tripRunId, payload);
    } catch (err: any) {
      this.logger.warn(`[Recovery] TripRun audit append failed: ${err?.message}`);
    }
  }

  /** Trip Task Memory：Recovery 审计尾（支持 failure_domain / is_retry 过滤，供回放与 Offline RL） */
  private async appendTripTaskMemoryRecoveryAudit(
    tripId: string | undefined | null,
    requestId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!tripId || !this.tripTaskMemory) return;
    try {
      await this.tripTaskMemory.appendRecoveryAuditEntry(tripId, { request_id: requestId, ...payload });
    } catch (err: any) {
      this.logger.warn(`[Recovery] TripTaskMemory audit append failed: ${err?.message}`);
    }
  }

  /**
   * REQUEST_CLARIFICATION：将中文提示作为助手回复返回（NEED_MORE_INFO）。
   */
  private buildRecoveryClarificationRouteResponse(
    request: RouteAndRunRequestDto,
    startTime: number,
    robustness: OrchestratorRobustnessMetadata,
    plan: ExecutionRecoveryPlan,
    obs: {
      mode_final: OrchestrationMode;
      deadline_ms: number;
      time_remaining_ms: number;
      durable_trip_run_id?: string;
    },
  ): RouteAndRunResponseDto {
    const answer =
      plan.clarification?.suggested_prompt_zh?.trim() ||
      robustness.message_preview ||
      '当前请求需要您补充或确认约束后再继续。';
    const receivedRouteDirectionId = this.resolveRequestRouteDirectionId(request);
    const of = toOrchestrationFailureObservability(robustness);
    return {
      request_id: request.request_id,
      route: {
        route: RouteType.SYSTEM2_REASONING,
        confidence: 0.55,
        reasons: [RouterReason.LLM_DECISION],
        required_capabilities: ['planning'],
        consent_required: false,
        budget: {
          max_seconds: Math.round((obs.deadline_ms ?? 12000) / 1000),
          max_steps: 8,
          max_browser_steps: 0,
        },
        ui_hint: {
          mode: 'slow',
          status: UIStatus.AWAITING_CONFIRMATION,
          message: '需要您的确认',
        },
      },
      result: {
        status: 'NEED_MORE_INFO' as const,
        answer_text: answer,
        payload: {
          timeline: [],
          dropped_items: [],
          candidates: [],
          evidence: [],
          robustness: null,
          needsUserConfirmation: true,
          clarificationMessage: answer,
          recovery_kind: 'REQUEST_CLARIFICATION',
          orchestrator_robustness: robustness,
        } as any,
      },
      explain: {
        decision_log: [],
      } as any,
      observability: {
        latency_ms: Date.now() - startTime,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
        orchestration_mode_final: obs.mode_final,
        received_route_direction_id: receivedRouteDirectionId,
        recovery_kind: 'REQUEST_CLARIFICATION',
        recovery_retry_attempts: 0,
        recovery_trace: [],
        ...of,
        trace: {
          orchestration: {
            resolved: {
              mode: obs.mode_final || 'LEGACY',
              reason: 'recovery_clarification',
              matchedRules: ['phase_b_recovery'],
            },
          },
          timestamp: new Date().toISOString(),
          deadline_ms: obs.deadline_ms,
          time_remaining_ms: obs.time_remaining_ms,
          mode_final: obs.mode_final,
        } as any,
        ...(obs.durable_trip_run_id ? { durable_trip_run_id: obs.durable_trip_run_id } : {}),
      } as any,
    };
  }

  async confirmNegotiation(input: NegotiationResolutionDto): Promise<ConfirmNegotiationResponseDto> {
    const rec = this.negotiationSessions?.get(input.session_id);
    if (!rec || String(rec.expected_negotiation_hash) !== String(input.expected_negotiation_hash)) {
      throw new ConflictException({ error_code: 'NEGOTIATION_EXPIRED_OR_INVALID' });
    }

    const preItinerary = structuredClone(rec.itinerary);

    const resolver = this.negotiationResolver ?? new NegotiationResolverService();
    const { itinerary, resolution_patch_summary } = resolver.resolve({
      session_id: input.session_id,
      alternative_id: input.alternative_id,
      itinerary: rec.itinerary,
      negotiation_payload: rec.negotiation_payload,
    });

    // v2 Final Strict Guard: re-derive EvidenceBundle using current cached evidence (Current Reality).
    const strict = process.env.C1_STRICT_EVIDENCE_BUNDLE === '1' || process.env.C1_STRICT_EVIDENCE_BUNDLE === 'true';
    if (strict && this.evidenceCache) {
      const request = (rec as any)?.request ?? {};
      const emergencyConstraints = (request as any)?.emergency_constraints ?? {};
      const constraints_hash = this.evidenceCache.hashEmergencyConstraints(emergencyConstraints ?? null);
      const prefetchedEvidence: any[] = [];

      // PT (5m): keyed by station pair
      const pair = (emergencyConstraints as any)?.pt_station_pair;
      if (pair?.station_a && pair?.station_b) {
        const geo_hash = this.evidenceCache.transitPairHash(String(pair.station_a), String(pair.station_b));
        const time_bucket = this.evidenceCache.timeBucketIso(Date.now(), 5);
        const recPt = await this.evidenceCache.get({ rule_id: 'public_transport_v1', geo_hash, time_bucket, constraints_hash });
        if (recPt?.evidence) prefetchedEvidence.push(recPt.evidence);
      }

      // Weather (60m): keyed by geo; we read anchor from emergency constraints if present.
      const healWeather = (emergencyConstraints as any)?.heal_prefetch_weather;
      if (healWeather?.lat != null && healWeather?.lng != null) {
        const geo_hash = this.evidenceCache.geoHash(Number(healWeather.lat), Number(healWeather.lng), 2);
        const time_bucket = this.evidenceCache.timeBucketIso(Date.now(), 60);
        const recW = await this.evidenceCache.get({ rule_id: 'drive_safety_v1', geo_hash, time_bucket, constraints_hash });
        if (recW?.evidence) prefetchedEvidence.push(recW.evidence);
      }

      const assembler = this.getResponseAssembler();
      const bundle = assembler.deriveEvidenceBundleForConfirm({
        requestId: String((request as any)?.request_id ?? input.session_id),
        itinerary,
        emergencyConstraints,
        prefetchedEvidence,
      }) as any;

      // Unified timeline inspector: shared TravelTimeResolverService (L1 → L1b ±bucket → L2 → L3).
      const inspector = this.timelineInspector ?? new TimelineInspectorService();
      const resolverSvc =
        this.travelTimeResolver ?? new TravelTimeResolverService(this.evidenceCache, this.travelTimeRouter, this.accessTracker);
      const memo = new Map<string, { minutes: number; lineage: TravelTimeEvidenceLineageDto }>();
      const nowMs = Date.now();
      const travelCtx: TravelTimeEdgeContext = {
        nowMs,
        constraints_hash,
        prefetchedEvidence,
        memo,
      };
      const resolver = async (cur: any, next: any) => {
        const r = await resolverSvc.getMinTravelMinutes(cur, next, travelCtx);
        if (!r) return undefined;
        return { minutes: r.minutes, source_lineage: r.lineage };
      };

      const timeline = await inspector.inspect({ itinerary: itinerary as any, travelTimeResolver: resolver });
      const reasonCodes = Array.from(new Set(timeline.conflicts.map((c) => c.reason_code)));
      if (reasonCodes.length) {
        bundle.failure_reason_codes = sortFailureReasonCodes([
          ...(Array.isArray(bundle.failure_reason_codes) ? bundle.failure_reason_codes : []),
          ...reasonCodes,
        ]);
        bundle.verification_status = 'FAILED';
      }

      if (String(bundle?.verification_status ?? '') === 'FAILED') {
        const tradeoff =
          this.tradeoffEngine ??
          new TradeoffEngineService(
            this.evidenceCache,
            this.travelTimeRouter,
            this.accessTracker,
            this.travelTimeResolver,
            this.itineraryRevisionRegret,
            this.userPreferenceLearning,
            undefined,
          );
        const negotiationPayload = await tradeoff.buildNegotiation({
          request,
          decisionLog: [],
          finalItinerary: itinerary as any,
          state: { research_data: { world: { physical: { prefetched_evidence: prefetchedEvidence } } } },
        });
        const hasBookingCollision = reasonCodes.includes('HEAL_IMPACT_BOOKING_COLLISION');
        if (hasBookingCollision && negotiationPayload && Array.isArray((negotiationPayload as any).alternatives)) {
          (negotiationPayload as any).alternatives = (negotiationPayload as any).alternatives.filter((a: any) => String(a?.id ?? '') !== 'POSTPONE_SCHEDULE');
          (negotiationPayload as any).default_option_id = 'UPGRADE_TO_DRIVE';
        }
        const travelImpossible = (timeline?.conflicts ?? []).find(
          (c: any) => String(c?.reason_code ?? '') === 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE' && c?.lineage_summary,
        );
        throw new ConflictException({
          error_code: 'NEGOTIATION_EXPIRED_OR_INVALID',
          verification_status: 'FAILED',
          evidence_bundle: bundle,
          ...(timeline?.conflicts?.length ? { timeline_impact: timeline } : {}),
          ...(travelImpossible?.lineage_summary ? { lineage_summary: travelImpossible.lineage_summary } : {}),
          negotiation_payload: negotiationPayload,
        });
      }
    }

    const request = (rec as any)?.request ?? {};
    const rev = await this.itineraryVersion?.persistSuccessfulNegotiationConfirm({
      tripId: (request as any)?.trip_id,
      userId: (request as any)?.user_id,
      sessionId: input.session_id,
      alternativeId: input.alternative_id,
      resolutionPatchSummary: resolution_patch_summary,
      preItinerary,
      postItinerary: itinerary,
      negotiationPayload: rec.negotiation_payload,
    });
    if (rev && this.itineraryVersion) {
      this.itineraryVersion.applyRevisionMetadataToItinerary(itinerary, {
        revision_id: rev.confirmed_revision_id,
        parent_revision_id: rev.parent_revision_id,
      });
    }

    // One-shot session: delete after successful resolution.
    this.negotiationSessions?.delete(input.session_id);

    // Async preference evolution: schedule after successful confirm (no added latency).
    this.preferenceEvolution?.scheduleDecisionDnaSync({
      userId: (request as any)?.user_id,
      tripId: (request as any)?.trip_id,
      reason: 'NEGOTIATION_CONFIRMED',
    });

    return {
      status: 'CONFIRMED',
      resolution_patch_summary,
      itinerary,
      ...(rev
        ? {
            itinerary_revision: {
              baseline_revision_id: rev.baseline_revision_id ?? undefined,
              confirmed_revision_id: rev.confirmed_revision_id,
              parent_revision_id: rev.parent_revision_id ?? undefined,
              audit: {
                delta_cost_usd: rev.audit.delta_cost_usd,
                delta_time_minutes: rev.audit.delta_time_minutes,
                interrupted_items: rev.audit.interrupted_items,
                resolution_type: rev.audit.resolution_type,
              },
            },
          }
        : {}),
    };
  }

  async logDecision(input: LogDecisionRequestDto): Promise<{ success: true; data: { logged: boolean } }> {
    const storage = (() => {
      if (!this.moduleRef) return undefined;
      try {
        return this.moduleRef.get(DecisionLogStorageService, { strict: false });
      } catch {
        return undefined;
      }
    })();

    const nowIso = new Date().toISOString();
    const tsIso = (() => {
      const s = input.client_ts?.trim();
      if (!s) return nowIso;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? nowIso : d.toISOString();
    })();

    const action: TripsDecisionLogEntry['action'] = (() => {
      switch (input.event) {
        case 'NEGOTIATION_CONFIRMED':
          return 'ALLOW';
        case 'NEGOTIATION_REJECTED':
          return 'REJECT';
        case 'NEGOTIATION_DISCARDED':
        case 'NEGOTIATION_TAG_EXPANDED':
          return 'MODIFY';
        case 'NEGOTIATION_OPENED':
        case 'NEGOTIATION_VIEWED':
        default:
          return 'EVALUATE';
      }
    })();

    const reasonCodes = [
      input.event,
      input.reasoning_tag ? `tag:${String(input.reasoning_tag)}` : undefined,
      input.selected_alternative_id ? `alt:${String(input.selected_alternative_id)}` : undefined,
    ].filter(Boolean) as string[];
    if (isCriticalDecisionActionValue(action) && reasonCodes.length === 0) {
      reasonCodes.push(`NEGOTIATION_${String(input.event)}`);
    }

    const entry: TripsDecisionLogEntry = {
      persona: 'USER_ACTION' as TripsDecisionPersona,
      action,
      explanation: input.reasoning_tag ? `${input.event} (${input.reasoning_tag})` : input.event,
      reasonCodes,
      evidenceRefs: [],
      timestamp: tsIso,
      decisionSource: 'USER',
      decisionStage: 'PLAN_EDIT' as TripsDecisionStage,
      metadata: {
        source: 'agent_log_decision',
        request_id: input.request_id,
        user_id: input.user_id,
        trip_id: input.trip_id,
        event: input.event,
        negotiation_session_id: input.negotiation_session_id,
        expected_negotiation_hash: input.expected_negotiation_hash,
        revision_id: input.revision_id,
        selected_alternative_id: input.selected_alternative_id,
        reasoning_tag: input.reasoning_tag,
        context: input.context ?? undefined,
        client_ts: input.client_ts ?? undefined,
        server_ts: nowIso,
      },
    };

    if (storage) {
      await storage.saveLogEntry(entry, {
        tripId: input.trip_id ?? undefined,
        metadata: { source: 'agent_log_decision' },
      });
    }

    return { success: true, data: { logged: Boolean(storage) } };
  }

  /**
   * Read back a persisted negotiation revision (audit vector + patch summary) for UI timeline.
   */
  async getNegotiationRevisionSnapshot(revisionId: string): Promise<{
    revision_id: string;
    trip_id: string | null;
    kind: string;
    resolution_patch_summary: string | null;
    delta_cost_usd: number | null;
    delta_time_minutes: number | null;
    interrupted_items: unknown;
    resolution_type: string | null;
    parent_revision_id: string | null;
    negotiation_session_id: string | null;
    alternative_id: string | null;
    created_at: Date;
  }> {
    const row = await this.itineraryVersion?.getRevisionById(revisionId);
    if (!row) {
      throw new NotFoundException({ error_code: 'ITINERARY_REVISION_NOT_FOUND' });
    }
    return {
      revision_id: row.id,
      trip_id: row.tripId ?? null,
      kind: row.kind,
      resolution_patch_summary: row.resolutionPatchSummary ?? null,
      delta_cost_usd: row.deltaCostUsd ?? null,
      delta_time_minutes: row.deltaTimeMinutes ?? null,
      interrupted_items: row.interruptedItems ?? [],
      resolution_type: row.resolutionType ?? row.alternativeId ?? null,
      parent_revision_id: row.parentRevisionId ?? null,
      negotiation_session_id: row.negotiationSessionId ?? null,
      alternative_id: row.alternativeId ?? null,
      created_at: row.createdAt,
    };
  }

  /** Aggregated decision timeline for a trip (revision chain + synthesized narratives). */
  async getItineraryRevisionTimeline(tripId: string): Promise<RevisionTimelineResponseDto> {
    const revisions = (await this.itineraryRevisionTimeline?.listTimelineForTrip(tripId)) ?? [];
    return { trip_id: tripId, revisions };
  }

  /** Physical rollback: restore a historical snapshot and append a ROLLBACK revision (causal closure). */
  async rollbackItinerary(body: ItineraryRollbackRequestDto): Promise<ItineraryRollbackResponseDto> {
    if (!this.itineraryRollback) {
      throw new BadRequestException({ error_code: 'ROLLBACK_SERVICE_UNAVAILABLE' });
    }
    const r = await this.itineraryRollback.rollbackToRevision(body.revision_id);

    // Async preference evolution: rollback is a strong negative signal.
    // We derive userId from the target revision row (same user who owns the chain).
    try {
      const row = await this.itineraryVersion?.getRevisionById(body.revision_id);
      this.preferenceEvolution?.scheduleDecisionDnaSync({
        userId: (row as any)?.userId ?? (row as any)?.user_id ?? null,
        tripId: r.trip_id,
        reason: 'NEGOTIATION_ROLLED_BACK',
      });
    } catch {
      // best-effort; never block rollback
    }
    return {
      itinerary: r.itinerary,
      new_revision_id: r.new_revision_id,
      trip_id: r.trip_id,
      rolled_back_from_revision_id: r.rolled_back_from_revision_id,
      target_revision_id: r.target_revision_id,
    };
  }

  private shouldPersistRouteAndRunDecisionLogs(request: RouteAndRunRequestDto): boolean {
    if (request.options?.dry_run) return false;
    const v = String(process.env.ROUTE_AND_RUN_PERSIST_DECISION_LOGS ?? '').toLowerCase();
    return v === '1' || v === 'true';
  }

  private mapRouteAndRunDecisionLogToTrips(
    entries: DecisionLogEntry[],
    audit?: { tripRunId?: string; planVersion?: number },
  ): TripsDecisionLogEntry[] {
    return mapOrchestrationDecisionLogToTrips(entries, {
      forExplain: false,
      tripRunId: audit?.tripRunId,
      planVersion: audit?.planVersion,
    });
  }

  private async persistRouteAndRunDecisionLogs(params: {
    request: RouteAndRunRequestDto;
    orchestrationDecisionLog?: DecisionLogEntry[];
    tripRunId?: string | null;
    planVersion?: number;
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
    const mapped = this.mapRouteAndRunDecisionLogToTrips(logs, {
      tripRunId: params.tripRunId ?? undefined,
      planVersion: params.planVersion,
    });
    if (mapped.length === 0) return;
    await storage.saveLogEntries(mapped, {
      tripId: params.request.trip_id ?? undefined,
      metadata: { source: 'route_and_run', request_message: params.request.message },
    });
  }

  /** Trip Task Memory（Redis）：replan 继承链写入 `history`（PRD I3 / §5.1） */
  private touchTripTaskMemoryReplanAudit(
    request: RouteAndRunRequestDto,
    orchestrationResult: OrchestrationResult | null | undefined,
    tripRunId?: string | null,
  ): void {
    if (!this.tripTaskMemory) return;
    const opt = request.options;
    const hasPrev =
      opt?.previous_plan_version !== undefined ||
      (typeof opt?.previous_world_snapshot_hash === 'string' && !!opt.previous_world_snapshot_hash.trim());
    const tid = typeof request.trip_id === 'string' ? request.trip_id.trim() : '';
    if (!hasPrev || !tid) return;

    const st = orchestrationResult?.result?.state as OrchestratorState | undefined;
    void this.tripTaskMemory
      .recordReplanLineageAudit(tid, {
        requestId: request.request_id,
        tripRunId: tripRunId ?? undefined,
        previous_plan_version: opt?.previous_plan_version,
        previous_world_snapshot_hash: opt?.previous_world_snapshot_hash,
        new_plan_version: typeof st?.plan_version === 'number' ? st.plan_version : undefined,
      })
      .catch(() => {});
  }

  private getResponseAssembler(): RouteAndRunResponseAssemblerService {
    return (
      this.responseAssembler ??
      new RouteAndRunResponseAssemblerService(
        new JepaProjectorService(),
        new TradeoffEngineService(undefined, new TravelTimeRouterService(), undefined, undefined, undefined, undefined),
        undefined,
        this.negotiationSessions,
      )
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
      conversation_context_type: request.conversation_context?.context_type ?? null,
      options: {
        entry_point: request?.options?.entry_point,
        use_claude_orchestration: request?.options?.use_claude_orchestration,
        use_state_machine_orchestration: request?.options?.use_state_machine_orchestration,
        max_seconds: request?.options?.max_seconds,
        orchestration_replay_anchor_snapshot_id:
          request?.options?.orchestration_replay_anchor_snapshot_id ?? null,
        orchestration_replay_strict_seal: request?.options?.orchestration_replay_strict_seal === true,
        change_impact_descriptor_fingerprint:
          request?.options?.change_impact_descriptor_v1 != null
            ? executionTimelineInputHash(request.options.change_impact_descriptor_v1)
            : null,
        trace_compatibility_mode: request?.options?.trace_compatibility_mode === 'legacy' ? 'legacy' : 'cid-aware',
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
   *
   * **与多智能体共识协作（MultiAgentCollaborationService）的关系**：
   * - 本入口按 `OrchestrationMode` 分流；**共识协作并非绑定某一 mode**，而是经由 `UnifiedWorldModelService`
   *   与 `PlanningWorkbenchAgentService.getWorldModelData(..., { tripId })` 等路径在 **trip 有界上下文** 内注册贡献。
   * - `LEGACY` / `CLAUDE_DYNAMIC` / `CLAUDE_SM` 均可与统一世界模型并存；是否出现 `STRATEGY_CONFLICT` 取决于
   *   是否调用带 `tripId` 的世界模型桥接及域 Agent 是否注入。
   */
  async routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto> {
    const asyncMode = String(request.options?.async_mode ?? 'OFF').trim().toUpperCase();
    if (asyncMode === 'FORCE') {
      if (!this.routeAndRunAsyncDelegationService) {
        this.logger.warn(
          `[AgentService] async_mode=FORCE 但 RouteAndRunAsyncDelegationService 未注入，回落同步 route_and_run request_id=${request.request_id}`,
        );
        return this.executionGateway.runRouteAndRun(request);
      }
      return this.routeAndRunAsyncDelegationService.delegate(request, {
        delegation_reason: 'async_mode=FORCE：入口立即委托后台 Durable Task',
      });
    }
    return this.executionGateway.runRouteAndRun(request);
  }

  /** Durable Task Pattern：秒回 task_id，后台执行完整 route_and_run */
  async routeAndRunAsync(request: RouteAndRunRequestDto) {
    if (!this.routeAndRunAsyncService) {
      throw new ServiceUnavailableException('RouteAndRunAsyncService is not configured');
    }
    return this.routeAndRunAsyncService.startRouteAndRunAsync(request);
  }

  async getRouteAndRunTaskStatus(taskId: string) {
    if (!this.routeAndRunAsyncTaskStore) {
      throw new ServiceUnavailableException('RouteAndRunAsyncTaskStore is not configured');
    }
    const status = await this.routeAndRunAsyncTaskStore.getStatus(taskId);
    if (!status) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }
    return status;
  }

  /**
   * 产品级 replay：仅通过 `route_and_run` + 冻结快照重入；不暴露 ReplayExecutionKernel 为 HTTP 路径。
   * `trace_id` 须与 `execution_trace_v1.snapshot_id` 一致（锚定 P3 记忆快照）。
   */
  async replayFromTrace(dto: ReplayFromTraceRequestDto): Promise<RouteAndRunResponseDto> {
    if (!this.memorySnapshotPersistence) {
      throw new ServiceUnavailableException(
        'Memory snapshot persistence is not configured; replay_from_trace requires Redis-backed snapshots',
      );
    }
    const trace = dto.execution_trace_v1;
    if (dto.trace_id.trim() !== trace.snapshot_id.trim()) {
      throw new BadRequestException('trace_id must equal execution_trace_v1.snapshot_id');
    }
    const memory = await this.memorySnapshotPersistence.loadBySnapshotId(trace.snapshot_id.trim());
    if (!memory) {
      throw new NotFoundException(`No persisted memory snapshot for trace_id=${dto.trace_id}`);
    }

    const baseRequest: RouteAndRunRequestDto = {
      request_id: dto.request_id?.trim() || randomUUID(),
      user_id: dto.user_id?.trim() || memory.userId || 'anonymous',
      trip_id: dto.trip_id ?? memory.tripId ?? undefined,
      message: dto.message?.trim() || '(replay_from_trace)',
      options: {
        ...(dto.options ?? {}),
        orchestration_replay_anchor_snapshot_id: trace.snapshot_id.trim(),
        execution_model_runtime_hint: dto.options?.execution_model_runtime_hint ?? 'replay_from_trace',
      },
    };

    const merged = mergeReplayProfileIntoRouteAndRunRequest(
      baseRequest,
      buildReplayProfileFromTrace(trace),
    );
    merged.options = {
      ...merged.options,
      orchestration_replay_anchor_snapshot_id: trace.snapshot_id.trim(),
      orchestration_replay_strict_seal: true,
      execution_model_allow_upgrade: false,
    };
    if (dto.expected_change_impact_descriptor_v1 != null) {
      merged.options.change_impact_descriptor_v1 = dto.expected_change_impact_descriptor_v1;
    }

    const response = await this.executionGateway.runRouteAndRun(merged);

    if (dto.expected_change_impact_descriptor_v1 != null) {
      const expected = parseChangeImpactDescriptorV1(dto.expected_change_impact_descriptor_v1);
      const traceOut = response.observability?.trace as Record<string, unknown> | undefined;
      const gotRaw = traceOut?.change_impact_descriptor_v1;
      if (gotRaw == null) {
        throw new BadRequestException(
          'replay_from_trace compare mode: observability.trace.change_impact_descriptor_v1 missing on response',
        );
      }
      const inferred = parseChangeImpactDescriptorV1(gotRaw);
      const reversibilityOk =
        serializeChangeImpactDescriptorForCompare(inferred) ===
        serializeChangeImpactDescriptorForCompare(expected);
      (response.observability as Record<string, unknown>).replay_change_impact_closure_v1 = {
        schemaId: 'agent.execution_os.replay_change_impact_closure@v1' as const,
        version: 1 as const,
        inferred_change_impact_descriptor_v1: inferred,
        reversibility_ok: reversibilityOk,
      };
      if (!reversibilityOk) {
        throw new BadRequestException(
          'replay_from_trace compare mode: change_impact_descriptor_v1 does not match expected_change_impact_descriptor_v1',
        );
      }
    }

    return response;
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
    orchestrationAbort?: AbortController,
    recoveryInvocation?: RecoveryInvocationContext,
    routingTaskType?: TaskType,
  ): Promise<RouteAndRunResponseDto> {
    this.logger.log(`[AgentService] 使用 Claude 状态机编排: request_id=${request.request_id}`);

    if (!this.claudeOrchestrator) {
      throw new Error('ClaudeOrchestratorService 未注入');
    }

    /**
     * CLAUDE_SM 入口曾忽略 routingTaskType：咨询类（DATA_LOOKUP / 泛问 GENERIC_QA）仍整链跑 PLAN_GEN。
     * 与 `orchestrate()` 首段对齐：轻量类型改走 `routeAndRunWithClaude`（注入 routingTaskType + 跳过状态机）。
     */
    const rt = routingTaskType ?? 'TRIP_PLANNING';
    if (rt === 'DATA_LOOKUP' || rt === 'GENERIC_QA' || rt === 'RAG_QA') {
      this.logger.log(
        `[AgentService] routingTaskType=${rt} → 跳过状态机，改走 orchestrate 轻量路径 request_id=${request.request_id}`,
      );
      return this.routeAndRunWithClaude(request, startTime, traceInfo, deadline);
    }

    if (
      request.trip_id?.trim() &&
      isWorkbenchAssistantPlaceholderMessage(request.message) &&
      this.claudeOrchestrator
    ) {
      this.logger.log(
        `[AgentService] 工作台占位欢迎语 → 短路（跳过状态机）request_id=${request.request_id}`,
      );
      const context: AgentContext = {
        requestId: request.request_id,
        userId: request.user_id,
        tripId: request.trip_id,
        tripRunId: tripRunId ?? undefined,
        conversationHistory: this.contextSlidingWindow.slice(
          'orchestrator_claude',
          request.conversation_context?.recent_messages,
        ),
        abortSignal: orchestrationAbort?.signal,
        routingTaskType: rt,
        ...(recoveryInvocation ? { recoveryInvocation } : {}),
      };
      const orchestrationResult =
        await this.claudeOrchestrator.orchestrateWorkbenchAssistantPlaceholder(
          request,
          context,
          startTime,
        );
      return this.getResponseAssembler().assembleClaudeStateMachineResponse({
        request,
        startTime,
        traceInfo,
        orchestrationResult,
        durableRun:
          tripRunId || resumedCheckpoint
            ? {
                trip_run_id: tripRunId ?? undefined,
                checkpoint_loaded: !!resumedCheckpoint,
              }
            : undefined,
      });
    }

    // 构建 AgentContext
    const context: AgentContext = {
      requestId: request.request_id,
      userId: request.user_id,
      tripId: request.trip_id,
      tripRunId: tripRunId ?? undefined,
      conversationHistory: this.contextSlidingWindow.slice(
        'orchestrator_claude',
        request.conversation_context?.recent_messages,
      ),
      abortSignal: orchestrationAbort?.signal,
      routingTaskType: rt,
      ...(recoveryInvocation ? { recoveryInvocation } : {}),
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

      if (tripRunId && this.tripRunManager && orchestrationResult.success) {
        const orchState = orchestrationResult.result?.state as OrchestratorState | undefined;
        const tripId = request.trip_id?.trim();
        if (orchState && tripId) {
          const pending = buildPendingItineraryAdjustDraft(orchState, tripId);
          if (pending) {
            await this.tripRunManager.updateTripRun({
              runId: tripRunId,
              metadata: { [PENDING_ITINERARY_ADJUST_DRAFT_META_KEY]: pending },
            });
          }
        }
      }

      // 调试日志：记录状态机执行结果
      this.logger.log(`[AgentService] 状态机执行完成: success=${orchestrationResult.success}, decisionLog.length=${orchestrationResult.decisionLog?.length || 0}`);
      if (orchestrationResult.result?.state) {
        this.logger.log(`[AgentService] 状态机状态: current_step=${orchestrationResult.result.state.current_step}, decision_log.length=${orchestrationResult.result.state.decision_log?.length || 0}`);
      }

    // 构建响应（C1 strict: may throw; we optionally auto-heal for PT hard fact failures）
    const assembler = this.getResponseAssembler();

    const persist = (reqToPersist: RouteAndRunRequestDto, orc: any) => {
      const orchState = orc?.result?.state as OrchestratorState | undefined;
      this.persistRouteAndRunDecisionLogs({
        request: reqToPersist,
        orchestrationDecisionLog: orc?.result?.state?.decision_log,
        tripRunId: tripRunId ?? undefined,
        planVersion: orchState?.plan_version,
      }).catch((e: unknown) => {
        const errMsg = e instanceof Error ? e.message : String(e);
        const matches = matchAxioms(
          buildAxiomMatchContext({
            message: reqToPersist.message,
            constraints: (reqToPersist as any)?.constraints,
            tripId: reqToPersist.trip_id,
            clarificationAnswers: (reqToPersist as any)?.clarification_answers,
          }),
        );
        const dom = pickDominantAxiom(matches);
        const stage = 'decision_logs';
        const errorTypeRaw =
          typeof (e as any)?.code === 'string'
            ? String((e as any).code)
            : /23514/.test(errMsg)
              ? '23514'
              : 'UNKNOWN';
        const errorType = errorTypeRaw === '23514' ? 'DB_CHECK_CONSTRAINT' : errorTypeRaw;

        //旁路可靠：持久化失败必须不影响主流程
        this.logger.warn(
          JSON.stringify({
            event: 'decision_os_audit_persist_failed',
            stage,
            request_id: reqToPersist.request_id,
            trip_id: reqToPersist.trip_id ?? undefined,
            axiom_id: dom?.axiom_id ?? 'UNKNOWN',
            cid: dom?.axiom.cid ?? 'UNKNOWN',
            error: errMsg,
            error_type: errorType,
          }),
        );
        this.promMetrics?.recordAuditPersistFailed({
          axiom_id: dom?.axiom_id,
          cid: dom?.axiom.cid,
          stage,
          error_type: errorType,
        });
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
      routingTaskType,
    });

    // First attempt
    persist(request, orchestrationResult);
    this.touchTripTaskMemoryReplanAudit(request, orchestrationResult, tripRunId);

    const observeRuntimeProof = (reqToObserve: RouteAndRunRequestDto, orc: any, terminal: boolean) => {
      try {
        const orchState = orc?.result?.state as { metadata?: Record<string, unknown>; trip_plan_request?: unknown } | undefined;
        const orchStateMeta = orchState?.metadata;
        const domAxiom = pickDominantAxiom(
          matchAxioms(
            buildAxiomMatchContext({
              message: reqToObserve.message,
              trip: orchState?.trip_plan_request as any,
              tripId: reqToObserve.trip_id,
              itinerary: (orchState as { itinerary?: unknown })?.itinerary as any,
              routeAndRunIntent: orchStateMeta?.route_and_run_intent as any,
              clarificationAnswers:
                (reqToObserve as any)?.clarification_answers ?? (orchStateMeta?.clarification_answers as any),
            }),
          ),
        );
        // If DecisionState/OrchestratorState is not available on this execution path, we still emit a
        // conservative observability sample so Scale Proof can compute P95 from runtime metrics.
        // This does not affect business decisions; it only fills a monitoring gap.
        if (!orc?.result?.decisionState || !orc?.result?.state) {
          if (domAxiom?.axiom_id) {
            this.promMetrics?.recordSessionConsistencyScore({
              score: 100,
              axiom_id: domAxiom.axiom_id,
              cid: domAxiom.axiom.cid,
              terminal,
            });
          }
          return;
        }
        const ds = orc?.result?.decisionState as DecisionState | undefined;
        const st = orc?.result?.state as OrchestratorState | undefined;
        if (!ds || !st) return;
        const audit_report = AuditReportGenerator.generate(ds, st) as any;
        const scoreRaw = audit_report?.session_consistency_score;
        const expectedCid = domAxiom?.axiom?.cid;
        const actualCid = audit_report?.dominant_cid ? String(audit_report.dominant_cid) : undefined;
        const axiomMatchSource = axiomMatchSourceForMetrics(domAxiom);
        const score =
          typeof scoreRaw === 'number'
            ? scoreRaw
            : domAxiom?.axiom_id
              ? 100
              : undefined;
        if (typeof score === 'number') {
          this.promMetrics?.recordSessionConsistencyScore({
            score,
            axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
            cid: actualCid ?? expectedCid ?? 'UNKNOWN',
            terminal,
          });
        }
        const drift = audit_report?.predictive_feedback_then_repair?.drift_vector;
        const deltaReason = String(drift?.delta_reason ?? '').trim();
        const delta_reason_kind =
          deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);
        if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
          this.promMetrics?.recordAxiomDominantCidMismatch({
            axiom_id: domAxiom.axiom_id,
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: terminal ? 'TERMINAL' : 'REQUEST',
            match_source: axiomMatchSource,
          });
        }
        if (delta_reason_kind === 'mismatch') {
          this.promMetrics?.recordAxiomSimRealMismatch({
            axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: terminal ? 'TERMINAL' : 'REQUEST',
            match_source: axiomMatchSource,
            severity: domAxiom?.axiom?.severity ?? 'UNKNOWN',
          });
        }
      } catch {
        // best-effort only
      }
    };
    try {
      const resp = await assemble(request, orchestrationResult);
      observeRuntimeProof(request, orchestrationResult, false);
      return resp;
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
            forbidden_modes: Array.from(
              new Set([...(request.emergency_constraints?.forbidden_modes ?? []), 'DRIVE', 'MOTORCYCLE']),
            ),
            preferred_modes: Array.from(
              new Set([...(request.emergency_constraints?.preferred_modes ?? []), 'RAIL', 'FERRY']),
            ),
            max_wind_speed_tolerance_mps:
              typeof request.emergency_constraints?.max_wind_speed_tolerance_mps === 'number'
                ? request.emergency_constraints.max_wind_speed_tolerance_mps
                : 18,
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
        this.touchTripTaskMemoryReplanAudit(patchedRequest, healed, tripRunId);
        const resp = await assemble(patchedRequest, healed);
        observeRuntimeProof(patchedRequest, healed, false);
        return resp;
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
        this.touchTripTaskMemoryReplanAudit(patchedRequest, healed, tripRunId);
        const resp = await assemble(patchedRequest, healed);
        observeRuntimeProof(patchedRequest, healed, false);
        return resp;
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
      const routeSignals = await this.resolveRoutingSignals(request);
      // 构建 Agent 上下文（注入 routingTaskType，供 CLAUDE_DYNAMIC 轻量咨询路径使用）
      const context: AgentContext = {
        requestId: request.request_id,
        userId: request.user_id,
        tripId: request.trip_id,
        conversationHistory: this.contextSlidingWindow.slice(
          'orchestrator_claude',
          request.conversation_context?.recent_messages,
        ),
        userPreferences: {},
        routingTaskType: routeSignals.taskType,
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

      return await assembler.assembleClaudeDynamicResponse({
        request,
        startTime,
        traceInfo,
        orchestrationResult,
        system1Result,
        routingTaskType: routeSignals.taskType,
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
        recentMessages: this.contextSlidingWindow.slice(
          'default',
          request.conversation_context?.recent_messages,
        ),
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
          undefined,
          undefined,
          request.options,
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

    // 缓存与 replay provenance：统一由 routeAndRun 成功出口的 finalizeSuccessfulFreshExecution 完成。

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
        ...(Array.isArray(obs.recovery_trace) && obs.recovery_trace.length > 0
          ? {
              recovery_trace: obs.recovery_trace,
              recovery_retry_attempts:
                typeof obs.recovery_retry_attempts === 'number'
                  ? obs.recovery_retry_attempts
                  : obs.recovery_trace.length,
            }
          : {}),
        is_replayed: false,
      },
    };
  }

  /**
   * FEATURE_AGENTIC_TOOL_LOOP：基础设施类轻量请求 → 原生 OpenAI tools + MCP（双轨实验）。
   */
  private async tryExecuteAgenticToolLoopFastPath(
    request: RouteAndRunRequestDto,
    startTime: number,
    traceInfo: { orchestration: any; timestamp: string },
    signals: RoutingSignals,
    decision: OrchestrationPolicyDecision,
    deadline: ReturnType<typeof createDeadline>,
    memory?: AgentMemoryContext,
  ): Promise<RouteAndRunResponseDto | null> {
    if (request.options?.dry_run) return null;
    if (!this.mcpAgentExecutor) return null;

    const flagRaw =
      this.configService?.get<string>('FEATURE_AGENTIC_TOOL_LOOP') ??
      process.env.FEATURE_AGENTIC_TOOL_LOOP;
    if (!parseAgenticToolLoopFlag(flagRaw)) return null;

    if (decision.mode === 'CLAUDE_SM') return null;
    if (request.options?.use_state_machine_orchestration === true) return null;
    if (!isInfrastructureFastTrackCandidate(signals, request.message)) return null;

    const packsEnv = parseAgenticToolPacksEnv(
      this.configService?.get<string>('AGENTIC_TOOL_LOOP_TOOL_PACKS') ??
        process.env.AGENTIC_TOOL_LOOP_TOOL_PACKS,
    );
    const toolPacks = packsEnv ?? inferDefaultAgenticToolPacks(request.message);

    const maxStepsRaw =
      this.configService?.get<string>('AGENTIC_TOOL_LOOP_MAX_STEPS') ??
      process.env.AGENTIC_TOOL_LOOP_MAX_STEPS ??
      '6';
    const maxSteps = Math.min(Math.max(parseInt(String(maxStepsRaw), 10) || 6, 1), 16);

    const remaining = deadline.remainingMs();
    if (remaining < 1500) return null;

    const execBudgetMs = Math.max(500, remaining - 200);

    const taskClosureBookingEnabled = parseFeatureTaskClosureBooking(
      this.configService?.get<string>('FEATURE_TASK_CLOSURE_BOOKING') ??
        process.env.FEATURE_TASK_CLOSURE_BOOKING,
    );

    const runtimeMcpCapEnabled = parseAgenticRuntimeMcpCapFlag(
      this.configService?.get<string>('FEATURE_AGENTIC_RUNTIME_MCP_CAP') ??
        process.env.FEATURE_AGENTIC_RUNTIME_MCP_CAP,
    );
    let runtimeMcpToolAllowlist: string[] | undefined;
    let runtimeMcpCapProvenance: string | undefined;
    if (runtimeMcpCapEnabled) {
      const phase = request.options?.agentic_runtime_planning_phase ?? 'planning';
      const derived = deriveAgenticMcpRuntimeAllowlist({
        phase,
        skillAllowlist: extractAgenticSkillAllowlistForMcpCap(request, memory),
        emergency: request.emergency_constraints ?? undefined,
      });
      runtimeMcpToolAllowlist = [...derived.allowedMcpToolNames];
      runtimeMcpCapProvenance = derived.provenance;
      this.logger.debug(
        `[AgenticRuntimeMcpCap] phase=${phase} provenance=${derived.provenance} tools=${runtimeMcpToolAllowlist.length}`,
      );
    }

    const mcpPreset = resolveAgenticMcpRetryBudget(signals.complexity);
    const envToolAttemptsRaw =
      this.configService?.get<string>('AGENTIC_MCP_TOOL_MAX_ATTEMPTS') ??
      process.env.AGENTIC_MCP_TOOL_MAX_ATTEMPTS;
    const envRetryBaseRaw =
      this.configService?.get<string>('AGENTIC_MCP_RETRY_BASE_MS') ??
      process.env.AGENTIC_MCP_RETRY_BASE_MS;
    const envToolAttempts =
      envToolAttemptsRaw != null && String(envToolAttemptsRaw).trim() !== ''
        ? parseInt(String(envToolAttemptsRaw), 10)
        : NaN;
    const envRetryBase =
      envRetryBaseRaw != null && String(envRetryBaseRaw).trim() !== ''
        ? parseInt(String(envRetryBaseRaw), 10)
        : NaN;

    const hitlGovEnabled = parseAgenticGovernanceHitlFlag(
      this.configService?.get<string>('FEATURE_AGENTIC_GOVERNANCE_HITL') ??
        process.env.FEATURE_AGENTIC_GOVERNANCE_HITL,
    );
    const toolGovernancePolicies = mergeAgenticToolPolicies(
      hitlGovEnabled,
      memory?.activeTripState?.constraints?.tool_policies,
    );
    const governanceApprovedToolInvocations = mergeApprovedToolInvocations(
      memory?.activeTripState?.constraints?.approved_tool_invocations,
      request.options?.agentic_approved_tool_invocations,
    );

    let execResult: McpAgentExecutorRunResult;
    try {
      execResult = await withTimeout(
        this.mcpAgentExecutor.runLoop({
          message: request.message,
          maxSteps,
          toolPacks,
          budget: {
            maxTotalTokens:
              parseInt(
                String(
                  this.configService?.get<string>('AGENTIC_LOOP_MAX_TOTAL_TOKENS') ??
                    process.env.AGENTIC_LOOP_MAX_TOTAL_TOKENS ??
                    '4000',
                ),
                10,
              ) || 4000,
            minRemainingMsForNextLlm:
              parseInt(
                String(
                  this.configService?.get<string>('AGENTIC_LOOP_MIN_REMAINING_MS') ??
                    process.env.AGENTIC_LOOP_MIN_REMAINING_MS ??
                    '800',
                ),
                10,
              ) || 800,
            deadlineRemainingMs: () => deadline.remainingMs(),
            mcpMaxToolAttempts:
              Number.isFinite(envToolAttempts) && envToolAttempts >= 1 && envToolAttempts <= 8
                ? envToolAttempts
                : mcpPreset.mcpMaxToolAttempts,
            mcpRetryBaseMs:
              Number.isFinite(envRetryBase) && envRetryBase >= 0 && envRetryBase <= 30_000
                ? envRetryBase
                : mcpPreset.mcpRetryBaseMs,
          },
          ...(runtimeMcpCapEnabled
            ? { runtimeMcpToolAllowlist, runtimeMcpCapProvenance }
            : {}),
          toolGovernancePolicies,
          governanceApprovedToolInvocations,
          ...(taskClosureBookingEnabled
            ? {
                taskClosure: {
                  mode: 'booking' as const,
                  initialContext: { route: [], inventory_checked: false, failures: [] },
                  /** weather-only MCP：从 validate 起步以便 check_weather 命中策略 */
                  initialStage: 'validate' as const,
                },
              }
            : {}),
        }),
        execBudgetMs,
        'AGENTIC_TOOL_LOOP',
      );
    } catch (e: any) {
      this.logger.warn(`[AgentService] agentic tool loop aborted: ${e?.message || e}`);
      return null;
    }

    const orch = this.buildOrchestrationResultFromAgentic(execResult, request.request_id);

    try {
      const o = traceInfo.orchestration ?? {};
      o.resolved = {
        ...(o.resolved ?? {}),
        agentic_tool_loop: true,
        agentic_trace_stopped: execResult.trace.stopped_reason,
      };
      traceInfo.orchestration = o;
    } catch {
      // best-effort trace enrichment
    }

    const assembler = this.getResponseAssembler();
    return await assembler.assembleClaudeDynamicResponse({
      request,
      startTime,
      traceInfo,
      orchestrationResult: orch,
      system1Result: {
        success: orch.success,
        answerText: execResult.final_message ?? orch.answerText ?? '',
        result: {
          agentic_tool_loop_trace: execResult.trace,
        },
      },
      routingTaskType: signals.taskType,
    });
  }

  private extractPrimaryRobustnessFromAgenticTrace(
    exec: McpAgentExecutorRunResult,
  ): OrchestratorRobustnessMetadata | undefined {
    for (let i = exec.trace.steps.length - 1; i >= 0; i--) {
      const tr = exec.trace.steps[i]?.tool_results;
      if (!tr) continue;
      for (let j = tr.length - 1; j >= 0; j--) {
        const env = tr[j]?.envelope;
        if (env && env.success === false && env.orchestrator_robustness) {
          return env.orchestrator_robustness;
        }
      }
    }
    return undefined;
  }

  private buildOrchestrationResultFromAgentic(
    exec: McpAgentExecutorRunResult,
    requestId: string,
  ): OrchestrationResult {
    const robustness =
      exec.orchestrator_robustness ?? this.extractPrimaryRobustnessFromAgenticTrace(exec);
    const duration = exec.trace.steps.reduce((a, s) => a + (s.latency_ms ?? 0), 0);
    const stepsExecuted = exec.trace.steps.map((st, i) => ({
      stepId: `agentic_${i + 1}`,
      skillName: 'mcp.tool_loop',
      success:
        !st.tool_results?.length ||
        !st.tool_results.some((t) => !t.envelope.success),
      duration: st.latency_ms ?? 0,
      result: st.tool_results,
    }));

    const answer =
      exec.final_message?.trim() ||
      (!exec.success ? exec.trace.stopped_reason : '') ||
      '';

    return {
      success: exec.success && !!exec.final_message?.trim(),
      result: {
        routingDecision: {
          route: 'SYSTEM1_API',
          confidence: 0.93,
          reasoning: 'FEATURE_AGENTIC_TOOL_LOOP fast path (native OpenAI tools + MCP)',
          budget: { max_seconds: 8, max_steps: 8, max_browser_steps: 0 },
          selected_path: 'AGENTIC_TOOL_LOOP',
          requiredCapabilities: ['mcp.native_tools'],
        },
        agentic_tool_loop: {
          stopped_reason: exec.trace.stopped_reason,
          steps: exec.trace.steps,
        },
        ...(exec.metrics
          ? {
              agentic_observability: {
                tool_call_count: exec.metrics.tool_call_count,
                llm_rounds: exec.metrics.llm_rounds,
                prompt_tokens: exec.metrics.prompt_tokens,
                completion_tokens: exec.metrics.completion_tokens,
                total_tokens: exec.metrics.total_tokens,
              },
            }
          : {}),
        ...(robustness ? { orchestrator_robustness: robustness } : {}),
      },
      answerText: answer,
      stepsExecuted,
      totalDuration: duration || 0,
      decisionLog: [
        {
          request_id: requestId,
          step: 'INTAKE' as OrchestrationStep,
          actor: 'Orchestrator' as SubAgentType,
          inputs_summary: 'FEATURE_AGENTIC_TOOL_LOOP',
          outputs_summary: exec.success ? 'agentic_completed' : exec.trace.stopped_reason,
          evidence_refs: [],
          timestamp: new Date().toISOString(),
          metadata: {
            agentic_tool_loop: true,
            ...(exec.metrics ? { tool_calls: exec.metrics.tool_call_count } : {}),
            ...(robustness ? { orchestrator_robustness: robustness } : {}),
          },
        },
      ],
    };
  }

  /**
   * 统一成功出口：`attachObservability` → Replay Lifecycle（补 profile / validate / invalidation 提示 / stamp / cache）。
   * DEDUP / NEED_MORE_INFO / REDIRECT_REQUIRED / dry_run 在 finalize 内短路。
   */
  private wrapSuccessfulRouteAndRunReturn(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
    obsPayload: Record<string, unknown>,
    requestHash: string,
  ): RouteAndRunResponseDto {
    const attached = this.attachObservability(response, obsPayload, request);
    try {
      const contractAck = assertExecutionGatewayPostReturnContract({ request, response: attached });
      const obs = (attached.observability ?? {}) as Record<string, unknown>;
      attached.observability = obs as RouteAndRunResponseDto['observability'];
      if (contractAck.execution_trace_compatibility_v1) {
        obs.execution_trace_compatibility_v1 = contractAck.execution_trace_compatibility_v1;
      }
      obs.execution_contract_governance_v1 = buildExecutionContractGovernanceEchoV1();
    } catch (e) {
      if (e instanceof ExecutionGatewayContractViolation) {
        this.logger.error(`[ExecutionGateway] contract violation ${e.code}: ${e.message}`);
        throw new InternalServerErrorException(e.message);
      }
      throw e;
    }
    void this.userStandingPreference?.mergeFromRouteAndRunIfEligible(request).catch((err: unknown) =>
      this.logger.warn(
        `[UserStandingPreference] async merge failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return this.finalizeSuccessfulFreshExecution(request, attached, requestHash);
  }

  private finalizeSuccessfulFreshExecution(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
    requestHash: string,
  ): RouteAndRunResponseDto {
    const modeFinal = (response.observability as { mode_final?: string } | undefined)?.mode_final;
    if (modeFinal === 'DEDUP') {
      return response;
    }
    const status = response.result?.status;
    if (response.async_task?.is_async_delegated === true || status === 'PROCESSING') {
      return response;
    }
    if (status === 'NEED_MORE_INFO' || status === 'REDIRECT_REQUIRED') {
      return response;
    }
    if (request.options?.dry_run || !this.requestDeduplication) {
      return response;
    }

    this.ensureFreshRuntimeExecutionProfileAndValidation(request, response);
    attachFreshRuntimeMaterialization(request, response);

    replayLifecycleManager.stampProvenance({ response, request });
    attachFullResponseReplayArtifactDescriptor(response, request);
    void this.runtimeReplayPersistence
      ?.persistFreshReplayAnchor({
        request,
        requestHash,
        response,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `fresh replay anchor persist: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.requestDeduplication.cacheResponse(requestHash, response);
    return response;
  }

  private ensureFreshRuntimeExecutionProfileAndValidation(
    request: RouteAndRunRequestDto,
    response: RouteAndRunResponseDto,
  ): void {
    const obs = response.observability as Record<string, unknown>;
    let profile = obs.runtime_execution_profile as RuntimeExecutionProfile | undefined;
    if (!profile) {
      const route = response.route?.route ?? '';
      profile = buildRuntimeExecutionProfileLegacyAssembly({
        compatibilityRoute: route,
        toolCalls: Number(response.observability?.tool_calls ?? 0),
        browserSteps: Number(response.observability?.browser_steps ?? 0),
      });
      obs.runtime_execution_profile = profile;
    }
    const validation = replayLifecycleManager.validateReplay(profile);
    if (validation.anomalies.length > 0) {
      obs.runtime_execution_anomalies = mergeRuntimeExecutionAnomaliesByCode(
        obs.runtime_execution_anomalies as RuntimeExecutionAnomaly[] | undefined,
        validation.anomalies,
      );
    }
    const inv = replayLifecycleManager.invalidateReplay(validation);
    if (inv.scope !== 'NONE') {
      (response.observability as RouteAndRunResponseDto['observability']).replay_invalidation_decision =
        inv;
    }
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
    const memContract = request ? (request as any).__memoryContractObs : undefined;
    const ledgerHealing = request ? (request as any).__ledgerHealingObs : undefined;
    const execMemBinding =
      (request ? (request as any).__memoryExecutionBinding : undefined) ??
      this.agentExecutionContextStore.get()?.executionBinding;
    if (request && !memContract) {
      this.promMetrics?.recordMemoryContractMissing();
    }
    if (memContract?.loaded_at_iso) {
      const age = Date.now() - new Date(String(memContract.loaded_at_iso)).getTime();
      if (Number.isFinite(age) && age >= 0) {
        this.promMetrics?.observeMemoryContextSnapshotAgeMs(age);
      }
    }
    const timelinePreview = request?.request_id
      ? this.executionTimelineRecorder?.getRingPreview(request.request_id)
      : undefined;
    resp.observability = {
      ...(resp.observability ?? {}),
      ...obs,
      ...(memContract ? { memory_contract: memContract } : {}),
      ...(ledgerHealing ? { ledger_healing: ledgerHealing } : {}),
      ...(execMemBinding ? { execution_memory_binding: execMemBinding } : {}),
      ...(timelinePreview && timelinePreview.length > 0
        ? { execution_timeline_preview: timelinePreview }
        : {}),
    };
    if (obs?.mode_final === 'DEDUP') {
      const r = resp.route?.route;
      const label = typeof r === 'string' ? r : undefined;
      const cachedProv = (resp.observability as { replay_cache_provenance?: ReplayProvenance })
        ?.replay_cache_provenance;
      const replayCtx = replayLifecycleManager.buildDedupValidationContext({
        cachedProvenance: cachedProv,
        request,
      });
      const dedupProfile = buildRuntimeExecutionProfileDedupReplay(label);
      const dedupVal = replayLifecycleManager.validateReplay(dedupProfile, replayCtx);
      const obsAny = resp.observability as {
        runtime_execution_profile?: unknown;
        runtime_execution_anomalies?: unknown;
      };
      obsAny.runtime_execution_profile = dedupProfile;
      if (dedupVal.anomalies.length) {
        obsAny.runtime_execution_anomalies = dedupVal.anomalies;
      }
    }
    if (resp.observability && obs?.mode_final && !('orchestration_mode_final' in resp.observability)) {
      (resp.observability as any).orchestration_mode_final = obs.mode_final;
    }
    const omfReplay =
      (resp.observability as { orchestration_mode_final?: string }).orchestration_mode_final;
    /** Dedup 命中以稳定化层 `obs.mode_final` 为准；缓存体可能仍带上一轮的 `orchestration_mode_final`。 */
    (resp.observability as RouteAndRunResponseDto['observability']).is_replayed =
      obs?.mode_final === 'DEDUP' || omfReplay === 'DEDUP';
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

