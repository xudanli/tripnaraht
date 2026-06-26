// src/agent/agent.module.ts
import { Module, Optional, forwardRef } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { ActionsController } from './actions.controller';
import { QuickPlanController } from './quick-plan.controller';
import { AgentService } from './services/agent.service';
import { ExecutionGatewayService } from './services/execution-gateway.service';
import { TripOrchestrationLockService } from './services/trip-orchestration-lock.service';
import { EcpsRuntimeBiasService } from './services/ecps-runtime-bias.service';
import { ExecutionPolicyVersionRegistryService } from './services/execution-policy-version-registry.service';
import { PolicyAgentPopulationService } from './services/policy-agent-population.service';
import { CognitiveAssetRegistryService } from './services/cognitive-asset-registry.service';
import { CognitiveMarketService } from './services/cognitive-market.service';
import { ExecutionEngineRouterService } from './services/execution-engine-router.service';
import { RouterService } from './services/router.service';
import { AgentStateService } from './services/agent-state.service';
import { ActionRegistryService } from './services/action-registry.service';
import { System1ExecutorService } from './services/system1-executor.service';
import { System1InfoCardService } from './services/system1-info-card.service';
import { SystemCollaborationService } from './services/system-collaboration.service';
import { HallucinationDetectionService } from './services/hallucination-detection.service';
import { OrchestratorService } from './services/orchestrator.service';
import { CriticService } from './services/critic.service';
import { EventTelemetryService } from './services/event-telemetry.service';
import { ActionCacheService } from './services/action-cache.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import { ActionDependencyAnalyzerService } from './services/action-dependency-analyzer.service';
import { LlmPlanService } from './services/llm-plan-service';
import { WebBrowseExecutorService } from './services/webbrowse-executor.service';
import { LlmModule } from '../llm/llm.module';
import { PlacesModule } from '../places/places.module';
import { TripsModule } from '../trips/trips.module';
import { TripProcessFairnessModule } from '../trips/process-fairness/trip-process-fairness.module';
import { TripDecisionProfilingModule } from '../trips/decision-profiling/decision-profiling.module';
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';
import { ItineraryOptimizationModule } from '../itinerary-optimization/itinerary-optimization.module';
import { TransportModule } from '../transport/transport.module';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';
import { RailPassModule } from '../railpass/railpass.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { CausalRuntimeModule } from '../trips/causal-runtime/causal-runtime.module';
import { OptimizationModule } from '../trips/decision/optimization/optimization.module';
import { SharedMemoryModule } from './memory/shared-memory.module';
import { RagModule } from '../rag/rag.module';
import { PlacesService } from '../places/places.service';
import { TripsService } from '../trips/trips.service';
import { ItineraryItemsService } from '../itinerary-items/itinerary-items.service';
import { VectorSearchService } from '../places/services/vector-search.service';
import { EntityResolutionService } from '../places/services/entity-resolution.service';
import { TransportRoutingService } from '../transport/transport-routing.service';
import { EnhancedVRPTWOptimizerService } from '../itinerary-optimization/services/enhanced-vrptw-optimizer.service';
import { FeasibilityService } from '../planning-policy/services/feasibility.service';
import { RailPassService } from '../railpass/railpass.service';
import { createTripActions } from './services/actions/trip.actions';
import { createPlacesActions } from './services/actions/places.actions';
import { createTransportActions } from './services/actions/transport.actions';
import { createItineraryActions } from './services/actions/itinerary.actions';
import { createPolicyActions } from './services/actions/policy.actions';
import { createWebBrowseActions } from './services/actions/webbrowse.actions';
import { createRailPassActions } from '../railpass/actions/railpass-agent-actions';
import { createReadinessActions } from './services/actions/readiness.actions';
import { ReadinessService } from '../trips/readiness/services/readiness.service';
import { ReadinessGuardianNegotiationService } from '../trips/readiness/services/readiness-guardian-negotiation.service';
import { ReadinessCausalPreanalysisService } from '../trips/readiness/services/readiness-causal-preanalysis.service';
import { ReadinessRepairService } from '../trips/readiness/services/readiness-repair.service';
import { createPlanningActions } from './services/actions/planning.actions';
import { createExecutionActions } from './services/actions/execution.actions';
import { createTripDetailActions } from './services/actions/trip-detail.actions';
import { TripNaraSystemPromptService } from './services/tripnara-system-prompt.service';
import { ReactSystemPromptService } from './services/react-system-prompt.service';
import { PlanExecuteModule } from './plan-execute/plan-execute.module';
import { ClaudeOrchestratorService } from './services/claude-orchestrator.service';
import { PersonaShellService } from './services/persona-shell.service';
import { PlanningWorkbenchAgentService } from './services/planning-workbench-agent.service';
import { PlanningWorkbenchKernelBridgeService } from './services/planning-workbench-kernel-bridge.service';
import { AgentOpsOutcomeBridgeService } from './services/agent-ops-outcome-bridge.service';
import { PlanningWorkbenchAdminService } from './services/planning-workbench-admin.service';
import { ExecutionAgentService } from './services/execution-agent.service';
import { TripDetailAgentService } from './services/trip-detail-agent.service';
import { ExecutionController } from './execution.controller';
import { TripDetailController } from './trip-detail.controller';
import { PlanningWorkbenchController } from './planning-workbench.controller';
import { PlanningWorkbenchAdminController } from './planning-workbench-admin.controller';
import { AgentAdminController } from './agent-admin.controller';
import { DecisionReplayController } from './controllers/decision-replay.controller';
import { AgentRunAdminService } from './services/agent-run-admin.service';
import { TripRunManagerService } from './services/trip-run-manager.service';
import { ActionExecutionService } from './services/action-execution.service';
import { FinancialHoldStoreService } from './services/financial-hold-store.service';
import { SideEffectRegistryService } from './services/side-effect-registry.service';
import { SideEffectParamResolverService } from './services/side-effect-param-resolver.service';
import { SideEffectRuleSyncerService } from './services/side-effect-rule-syncer.service';
import { HardTruthRuleResolverService } from './services/hard-truth-rule-resolver.service';
import { AgentActionLogService } from './services/agent-action-log.service';
import { ClarificationHandlerService } from './services/clarification-handler.service';
import { ResearchPriorSnapshotService } from './services/research-prior-snapshot.service';
import { ShadowConflictScannerService } from './services/shadow-conflict-scanner.service';
import { ShadowRoutingEvaluatorService } from './services/shadow-routing-evaluator.service';
import { ShadowRouteClassEvaluatorService } from './services/shadow-route-class-evaluator.service';
import { LocalCaseStoreService } from './cbr/local-case-store.service';
import { CbrRepository } from './cbr/cbr.repository';
import { CbrAggregatorService } from './cbr/cbr-aggregator.service';
import { JepaProjectorService } from './services/jepa-projector.service';
import { RouteAndRunResponseAssemblerService } from './services/route-and-run-response-assembler.service';
import { GuardiansDebateService } from './services/guardians-debate.service';
import { ItinerarySlotPolisherService } from './services/itinerary-slot-polisher.service';
import { RouteRunItineraryPoiHydratorService } from './services/route-run-itinerary-poi-hydrator.service';
import { TradeoffEngineService } from './services/tradeoff-engine.service';
import { NegotiationNarratorService } from './services/negotiation-narrator.service';
import { HotelDecisionSupportNarratorService } from './services/hotel-decision-support-narrator.service';
import { TravelTimeResolverService } from './services/travel-time-resolver.service';
import { TravelTimeRouterService } from './services/travel-time-router.service';
import { DependencyHealthCheckService } from './services/dependency-health-check.service';
import { RecoveryStrategyService } from './services/recovery-strategy.service';
import { LLMTraceService } from './services/llm-trace.service';
import { LLMCacheService } from './services/llm-cache.service';
import { SmartInferenceService } from './services/smart-inference.service';
import { GateCoordinatorService, RuleGateService, ConfigGateService, SemanticGateService } from './services/gate-coordinator.service';
import { QuickPlanService } from './services/quick-plan.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { NegotiationSessionStoreService } from './services/negotiation-session-store.service';
import { NegotiationResolverService } from './services/negotiation-resolver.service';
import { TimelineInspectorService } from './services/timeline-inspector.service';
import { ItineraryVersionService } from './services/itinerary-version.service';
import { TripRobustnessDashboardService } from './services/trip-robustness-dashboard.service';
import { AuditRecordService } from './services/audit-record.service';
import { RevisionNarratorService } from './services/revision-narrator.service';
import { ItineraryRevisionTimelineService } from './services/itinerary-revision-timeline.service';
import { ItineraryRevisionRegretService } from './services/itinerary-revision-regret.service';
import { UserPreferenceLearningService } from './services/user-preference-learning.service';
import { UserProfileLearningService } from './services/user-profile-learning.service';
import { ItineraryRollbackService } from './services/itinerary-rollback.service';
import { PreferenceEvolutionService } from './services/preference-evolution.service';
import { DecisionOsP0Module } from '../decision/decision-os-p0.module';
import { AgentEntryResponseFactoryService } from './services/agent-entry-response-factory.service';
import { PlanningRequestClassifierService } from './services/planning-request-classifier.service';
import { DecisionReplayService } from './services/decision-replay.service';
import { UserStandingPreferenceService } from './services/user-standing-preference.service';
import { RouteAndRunContextEnricherService } from './services/route-and-run-context-enricher.service';
import { DecisionOsContextAssemblerService } from './runtime/decision-os-context-assembler.service';
import { DecisionOsExecutionContextStore } from './runtime/decision-os-execution-context.store';
import { DecisionRuntimeKernelService } from './runtime/decision-runtime-kernel.service';
import { RouteAndRunTaskProgressReporter } from './runtime/route-and-run-task-progress.reporter';
import { IntakeStreamingReporter } from './runtime/intake-streaming.reporter';
import { RouteAndRunAsyncTaskStore } from './services/route-and-run-async-task.store';
import { RouteAndRunAsyncService } from './services/route-and-run-async.service';
import { RouteAndRunAsyncDelegationService } from './services/route-and-run-async-delegation.service';
import { RouteAndRunAsyncTaskLeaseService } from './services/route-and-run-async-task-lease.service';
import { LocalRouteAndRunTaskEventBus } from './services/local-route-and-run-task-event.bus';
import { RouteAndRunTaskStreamService } from './services/route-and-run-task-stream.service';
import { RouteAndRunTaskStreamRegistry } from './services/route-and-run-task-stream.registry';
import { RouteAndRunTaskStreamMetricsService } from './services/route-and-run-task-stream-metrics.service';
import { RouteAndRunTaskLifecycleService } from './services/route-and-run-task-lifecycle.service';
import { RedisPubSubRouteAndRunTaskEventBus } from './services/redis-pub-sub-route-and-run-task-event.bus';
import { routeAndRunRedisPubSubProviders } from './redis/route-and-run-redis-pubsub.providers';
import { routeAndRunTaskEventBusProvider } from './providers/route-and-run-task-event-bus.provider';
import { CacheModule } from '../common/cache/cache.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LlmIntentCompilerService } from './runtime/llm-intent-compiler.service';
import { DecisionOsGrayRouterService } from './runtime/decision-os-gray-router.service';
import { RouteRunRequestFitnessHydratorService } from './memory/services/route-run-request-fitness-hydrator.service';
import { RouteRunIcelandMarketPriorHydratorService } from './memory/services/route-run-iceland-market-prior-hydrator.service';
import { SkillsModule } from '../skills/skills.module';
import { GovernanceModule } from '../governance/governance.module';
// 子 Agent 服务（Claude 编排）
import { ClaudePlannerAgentService } from './services/sub-agents/planner-agent.service';
import { ClaudeGatekeeperAgentService } from './services/sub-agents/gatekeeper-agent.service';
import { ClaudeComplianceAgentService } from './services/sub-agents/compliance-agent.service';
import { ClaudeLocalInsightAgentService } from './services/sub-agents/local-insight-agent.service';
import { ClaudeCoreDecisionAgentService } from './services/sub-agents/core-decision-agent.service';
import { ClaudeNarratorAgentService } from './services/sub-agents/narrator-agent.service';
import { SkillInputValidatorService } from './services/skill-input-validator.service';
import { SkillInputSchemaGeneratorService } from './services/skill-input-schema-generator.service';
import { AssistantsModule } from './assistants/assistants.module';
import { AgentInfraModule } from './infra/infra.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { DataModelingModule } from '../data-modeling/data-modeling.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TrainingModule } from './training/training.module';
import { DomainAgentsModule } from './services/domain-agents/domain-agents.module';
import { StrategyConflictOptionsService } from './services/strategy-conflict-options.service';
import { RuntimeReplayPersistenceService } from './services/runtime-replay-persistence.service';
import { DecisionDraftModule } from '../decision-draft/decision-draft.module';
import { ChainOfWorkModule } from '../chain-of-work/chain-of-work.module';
import { PostgreSQLMcpModule } from '../mcp/postgresql-mcp.module';
import { AmadeusDirectModule } from '../mcp/amadeus-direct.module';
import { BookingComModule } from '../mcp/booking-com.module';
import { FlightMcpModule } from '../mcp/flight-mcp.module';
import { RedisModule } from '../redis/redis.module';
import { AgentContextModule } from './context/agent-context.module';
import { RoadIsModule } from '../infrastructure/external/road-is/road-is.module';
import { DecisionContractCapturerService } from './services/decision-contract-capturer.service';
import { AgentActionReconcilerService } from './services/agent-action-reconciler.service';
import { SagaReconciliationCron } from './crons/saga-reconciliation.cron';
import { SideEffectCleanupAdapterRegistry } from './services/side-effect-cleanup-adapter.registry';
import { ActionGraphSagaCompilerService } from './services/action-graph-saga-compiler.service';
import { PhysicalValidatorService } from '../domain/ontology/validator/physical-validator.service';
import { SelfHealingService } from '../domain/ontology/healer/self-healing.service';
import { SpatialModule } from '../domain/spatial/spatial.module';
import { AuthModule } from '../auth/auth.module';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';

/**
 * Agent Module
 * 
 * Module 14: Semantic Router + Orchestrator
 */
@Module({
  imports: [
    LlmModule,
    forwardRef(() => PlacesModule), // 使用 forwardRef 避免循环依赖（PlacesModule <-> RagModule -> SkillsModule -> AgentModule）
    forwardRef(() => TripsModule), // 使用 forwardRef 避免循环依赖（TripsModule -> DecisionDraftModule -> ChainOfWorkModule -> AgentModule -> TripsModule）
    TripProcessFairnessModule, // F3.1 orchestrator 自动发起 Round Robin
    TripDecisionProfilingModule, // PDI-4 orchestrator 自动推送 Travel Style / Money DNA 调查
    ItineraryItemsModule,
    ItineraryOptimizationModule,
    TransportModule,
    PlanningPolicyModule,
    RailPassModule,
    ReadinessModule,
    DecisionModule,
    CausalRuntimeModule,
    OptimizationModule,
    SharedMemoryModule,
    forwardRef(() => RagModule), // RAG 模块（用于增强对话），使用 forwardRef 避免循环依赖（RagModule -> SkillsModule -> AgentModule）
    PlanExecuteModule, // Plan-and-Execute Agent 模块
    forwardRef(() => SkillsModule), // Skills 模块（用于 Claude 编排），使用 forwardRef 避免循环依赖（SkillsModule -> PlacesModule -> RagModule -> SkillsModule -> AgentModule）
    GovernanceModule,
    AssistantsModule, // 智能体助手模块（规划助手、行程助手）
    AgentInfraModule, // Infra 层（LLMExecutor、CoreGateway）
    CacheModule, // 异步 route_and_run 任务进度（task_progress:*）
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 32 }),
    RouteDirectionsModule, // 路线方向模块（用于信息卡片）
    DataModelingModule, // 数据建模模块（用于不确定性建模）
    PrismaModule, // Prisma 模块（用于数据库访问）
    SpatialModule, // POI→SpatialDomainSegment 投影，供 route_and_run Action PREVIEW 物理门
    DomainAgentsModule, // Geo/Weather/Cost/Experience 域 Agent（PlanningWorkbench getWorldModelData）
    TrainingModule, // Iterative Deployment 训练模块
    forwardRef(() => DecisionDraftModule), // 使用 forwardRef 避免循环依赖
    forwardRef(() => ChainOfWorkModule), // Phase B+：ExecutionIntegrationService（编排恢复闭环）
    PostgreSQLMcpModule, // PostgreSQL MCP 模块（用于 Admin 批量操作）
    AmadeusDirectModule, // Amadeus REST（轻量 path：航班库存 sensor）
    BookingComModule, // checkout Bundle 租车锁价重采样
    FlightMcpModule, // Flight MCP（Smithery/Kiwi，与 Amadeus 二选一或回退）
    RedisModule, // research prior 快照（可选 Redis；MCP 模式下为内存 cache）
    AgentContextModule, // P1-a：recent_messages 滑动窗口适配器（消费端迁移见 P1-b）
    forwardRef(() => AuthModule), // AdminStrictAuthGuard（replay 锚点 admin API）
    RoadIsModule, // ontology 区域 → Road.is / segment 缓存路况（轻量问答硬锚点附录）
    DecisionOsP0Module, // Validation Gateway + Contingency + SLO + DNA compliance
  ],
  controllers: [
    AgentController,
    ActionsController,
    QuickPlanController,
    PlanningWorkbenchController,
    PlanningWorkbenchAdminController,
    ExecutionController,
    TripDetailController,
    AgentAdminController,
    DecisionReplayController,
  ],
  providers: [
    ExecutionGatewayService,
    TripOrchestrationLockService,
    EcpsRuntimeBiasService,
    ExecutionPolicyVersionRegistryService,
    PolicyAgentPopulationService,
    CognitiveAssetRegistryService,
    CognitiveMarketService,
    ExecutionEngineRouterService,
    AgentService,
    RouterService,
    AgentStateService,
    ActionRegistryService,
    System1ExecutorService,
    System1InfoCardService,
    SystemCollaborationService,
    HallucinationDetectionService,
    OrchestratorService,
    CriticService,
    EventTelemetryService,
    ActionCacheService,
    RequestDeduplicationService,
    RuntimeReplayPersistenceService,
    AdminStrictAuthGuard,
    ActionDependencyAnalyzerService,
    LlmPlanService,
    WebBrowseExecutorService,
    TripNaraSystemPromptService,
    ReactSystemPromptService,
    ClaudeOrchestratorService, // Claude 编排服务
    PersonaShellService, // 人格外壳服务
    PlanningWorkbenchAgentService, // 规划工作台 Agent
    PlanningWorkbenchKernelBridgeService, // 规划工作台 ↔ Decision Kernel 桥接
    AgentOpsOutcomeBridgeService, // Agent → OPS outcome（自动携带 TripWorldState）
    PlanningWorkbenchAdminService, // 规划工作台管理服务（后台管理）
    ExecutionAgentService, // 执行阶段 Agent
    TripDetailAgentService, // 行程详情页 Agent
    // Claude 编排子 Agent
    ClaudePlannerAgentService, // Planner Agent（Claude 编排）
    ClaudeGatekeeperAgentService, // Gatekeeper Agent（Claude 编排）
    ClaudeComplianceAgentService, // Compliance Agent（Claude 编排）
    ClaudeLocalInsightAgentService, // LocalInsight Agent（Claude 编排）
    ClaudeCoreDecisionAgentService, // CoreDecision Agent（Claude 编排）
    ClaudeNarratorAgentService, // Narrator Agent（Claude 编排）
    SkillInputValidatorService, // Skill 输入参数验证服务
    SkillInputSchemaGeneratorService, // Skill Input Schema 自动生成服务
    AgentRunAdminService, // Agent 运行管理服务（后台管理）
    TripRunManagerService, // TripRun 和 TripAttempt 管理服务
    FinancialHoldStoreService,
    SideEffectRegistryService,
    SideEffectParamResolverService,
    SideEffectRuleSyncerService,
    HardTruthRuleResolverService,
    AgentActionLogService,
    PhysicalValidatorService,
    SelfHealingService,
    ActionExecutionService, // Action 执行域（preview/commit/rollback）
    AgentActionReconcilerService,
    SagaReconciliationCron,
    SideEffectCleanupAdapterRegistry,
    ActionGraphSagaCompilerService,
    DecisionContractCapturerService,
    JepaProjectorService,
    RouteRunItineraryPoiHydratorService,
    GuardiansDebateService,
    ItinerarySlotPolisherService,
    RouteAndRunResponseAssemblerService,
    TravelTimeResolverService,
    TradeoffEngineService,
    NegotiationNarratorService,
    HotelDecisionSupportNarratorService,
    TravelTimeRouterService,
    NegotiationSessionStoreService,
    NegotiationResolverService,
    TimelineInspectorService,
    AuditRecordService,
    RevisionNarratorService,
    ItineraryRevisionTimelineService,
    ItineraryRevisionRegretService,
    UserPreferenceLearningService,
    UserProfileLearningService,
    PreferenceEvolutionService,
    ItineraryRollbackService,
    ItineraryVersionService,
    TripRobustnessDashboardService,
    AgentEntryResponseFactoryService,
    PlanningRequestClassifierService,
    DecisionReplayService,
    UserStandingPreferenceService,
    RouteAndRunContextEnricherService,
    DecisionOsContextAssemblerService,
    DecisionOsExecutionContextStore,
    DecisionRuntimeKernelService,
    RouteAndRunTaskProgressReporter,
    IntakeStreamingReporter,
    RouteAndRunAsyncTaskStore,
    RouteAndRunAsyncService,
    RouteAndRunAsyncDelegationService,
    RouteAndRunAsyncTaskLeaseService,
    ...routeAndRunRedisPubSubProviders,
    LocalRouteAndRunTaskEventBus,
    RedisPubSubRouteAndRunTaskEventBus,
    routeAndRunTaskEventBusProvider,
    RouteAndRunTaskStreamService,
    RouteAndRunTaskStreamRegistry,
    RouteAndRunTaskStreamMetricsService,
    RouteAndRunTaskLifecycleService,
    LlmIntentCompilerService,
    DecisionOsGrayRouterService,
    RouteRunRequestFitnessHydratorService,
    RouteRunIcelandMarketPriorHydratorService,
    StrategyConflictOptionsService,
    ClarificationHandlerService,
    ResearchPriorSnapshotService,
    ShadowConflictScannerService,
    ShadowRoutingEvaluatorService,
    ShadowRouteClassEvaluatorService,
    CbrRepository,
    CbrAggregatorService,
    LocalCaseStoreService,
    DependencyHealthCheckService, // 依赖健康检查服务
    RecoveryStrategyService, // Recovery 策略服务
    // P0: 性能止血服务
    LLMTraceService, // LLM调用链埋点
    LLMCacheService, // LLM缓存
    // P0: Gate分层架构
    RuleGateService, // 硬规则Gate
    ConfigGateService, // 配置Gate
    SemanticGateService, // 语义Gate
    GateCoordinatorService, // Gate协调器
    // P0: 智能默认值
    SmartInferenceService, // 智能推断
    // P1: 快速规划
    QuickPlanService, // 快速规划服务
    // 功能开关
    FeatureFlagService, // 功能开关服务
    AgentOpsOutcomeBridgeService,
    // TokenStatsService 已移至 AgentInfraModule
  ],
  exports: [
    AgentContextModule,
    AgentService,
    ActionRegistryService,
    AgentOpsOutcomeBridgeService,
    TripNaraSystemPromptService,
    ReactSystemPromptService,
    AgentInfraModule, // 导出 Infra 模块（LLMExecutor、CoreGateway）
    ClaudeGatekeeperAgentService, // Phase 3: GateEvalExecutor 需要
    ClaudeLocalInsightAgentService, // Phase 4: RepairExecutor 需要
    SideEffectRuleSyncerService,
    SideEffectRegistryService,
    ActionExecutionService,
    FinancialHoldStoreService,
    AgentActionLogService,
    HardTruthRuleResolverService,
    ActionGraphSagaCompilerService,
    PhysicalValidatorService,
    SelfHealingService,
    PreferenceEvolutionService,
    UserProfileLearningService,
  ],
})
export class AgentModule {
  constructor(
    private placesService: PlacesService,
    private tripsService: TripsService,
    private itineraryItemsService: ItineraryItemsService,
    private webBrowseExecutor: WebBrowseExecutorService,
    @Optional() private actionRegistry?: ActionRegistryService,
    private vectorSearchService?: VectorSearchService,
    private entityResolutionService?: EntityResolutionService,
    private transportRoutingService?: TransportRoutingService,
    private vrptwOptimizer?: EnhancedVRPTWOptimizerService,
    private feasibilityService?: FeasibilityService,
    private railPassService?: RailPassService,
    private readinessService?: ReadinessService,
    @Optional() private guardianNegotiationService?: ReadinessGuardianNegotiationService,
    @Optional() private causalPreanalysisService?: ReadinessCausalPreanalysisService,
    @Optional() private readinessRepairService?: ReadinessRepairService,
    @Optional() private planningWorkbenchAgent?: PlanningWorkbenchAgentService,
    @Optional() private executionAgent?: ExecutionAgentService,
    @Optional() private tripDetailAgent?: TripDetailAgentService,
  ) {
    // 注册基础 Actions（在模块初始化时）
    this.registerBasicActions();
  }

  /**
   * 注册基础 Actions
   */
  private registerBasicActions() {
    if (!this.actionRegistry) {
      return; // ActionRegistryService 未注入，跳过注册
    }
    
    // 注册 Trip Actions
    const tripActions = createTripActions(this.tripsService, this.itineraryItemsService);
    this.actionRegistry.registerMany(tripActions);

    // 注册 Places Actions
    const placesActions = createPlacesActions(
      this.placesService,
      this.vectorSearchService,
      this.entityResolutionService
    );
    this.actionRegistry.registerMany(placesActions);

    // 注册 Transport Actions
    if (this.transportRoutingService) {
      const transportActions = createTransportActions(this.transportRoutingService);
      this.actionRegistry.registerMany(transportActions);
    }

    // 注册 Itinerary Actions
    if (this.vrptwOptimizer) {
      const itineraryActions = createItineraryActions(this.vrptwOptimizer);
      this.actionRegistry.registerMany(itineraryActions);
    }

    // 注册 Policy Actions
    if (this.feasibilityService) {
      const policyActions = createPolicyActions(this.feasibilityService);
      this.actionRegistry.registerMany(policyActions);
    }

    // 注册 WebBrowse Actions
    const webBrowseActions = createWebBrowseActions(this.webBrowseExecutor);
    this.actionRegistry.registerMany(webBrowseActions);

    // 注册 RailPass Actions
    if (this.railPassService) {
      const railPassActions = createRailPassActions(this.railPassService);
      this.actionRegistry.registerMany(railPassActions);
    }

    // 注册 Readiness Actions
    if (this.readinessService) {
      const readinessActions = createReadinessActions({
        readinessService: this.readinessService,
        guardianNegotiationService: this.guardianNegotiationService,
        causalPreanalysisService: this.causalPreanalysisService,
        readinessRepairService: this.readinessRepairService,
      });
      this.actionRegistry.registerMany(readinessActions);
    }
    
    // 注册 Planning Actions
    if (this.planningWorkbenchAgent) {
      const planningActions = createPlanningActions(this.planningWorkbenchAgent);
      this.actionRegistry.registerMany(planningActions);
    }
    
    // 注册 Execution Actions
    if (this.executionAgent) {
      const executionActions = createExecutionActions(this.executionAgent);
      this.actionRegistry.registerMany(executionActions);
    }
    
    // 注册 Trip Detail Actions
    if (this.tripDetailAgent) {
      const tripDetailActions = createTripDetailActions(this.tripDetailAgent);
      this.actionRegistry.registerMany(tripDetailActions);
    }
  }
}

