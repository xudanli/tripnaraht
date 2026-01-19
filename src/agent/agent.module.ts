// src/agent/agent.module.ts
import { Module, Optional } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
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
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';
import { ItineraryOptimizationModule } from '../itinerary-optimization/itinerary-optimization.module';
import { TransportModule } from '../transport/transport.module';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';
import { RailPassModule } from '../railpass/railpass.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { MemoryModule } from './memory/memory.module';
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
import { createPlanningActions } from './services/actions/planning.actions';
import { createExecutionActions } from './services/actions/execution.actions';
import { createTripDetailActions } from './services/actions/trip-detail.actions';
import { TripNaraSystemPromptService } from './services/tripnara-system-prompt.service';
import { ReactSystemPromptService } from './services/react-system-prompt.service';
import { PlanExecuteModule } from './plan-execute/plan-execute.module';
import { ClaudeOrchestratorService } from './services/claude-orchestrator.service';
import { PersonaShellService } from './services/persona-shell.service';
import { PlanningWorkbenchAgentService } from './services/planning-workbench-agent.service';
import { ExecutionAgentService } from './services/execution-agent.service';
import { TripDetailAgentService } from './services/trip-detail-agent.service';
import { ExecutionController } from './execution.controller';
import { TripDetailController } from './trip-detail.controller';
import { PlanningWorkbenchController } from './planning-workbench.controller';
import { SkillsModule } from '../skills/skills.module';
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

/**
 * Agent Module
 * 
 * Module 14: Semantic Router + Orchestrator
 */
@Module({
  imports: [
    LlmModule,
    PlacesModule,
    TripsModule,
    ItineraryItemsModule,
    ItineraryOptimizationModule,
    TransportModule,
    PlanningPolicyModule,
    RailPassModule,
    ReadinessModule,
    DecisionModule,
    MemoryModule,
    RagModule, // RAG 模块（用于增强对话）
    PlanExecuteModule, // Plan-and-Execute Agent 模块
    SkillsModule, // Skills 模块（用于 Claude 编排）
    AssistantsModule, // 智能体助手模块（规划助手、行程助手）
    AgentInfraModule, // Infra 层（LLMExecutor、CoreGateway）
    RouteDirectionsModule, // 路线方向模块（用于信息卡片）
    DataModelingModule, // 数据建模模块（用于不确定性建模）
  ],
  controllers: [AgentController, PlanningWorkbenchController, ExecutionController, TripDetailController],
  providers: [
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
    ActionDependencyAnalyzerService,
    LlmPlanService,
    WebBrowseExecutorService,
    TripNaraSystemPromptService,
    ReactSystemPromptService,
    ClaudeOrchestratorService, // Claude 编排服务
    PersonaShellService, // 人格外壳服务
    PlanningWorkbenchAgentService, // 规划工作台 Agent
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
    // TokenStatsService 已移至 AgentInfraModule
  ],
  exports: [
    AgentService,
    ActionRegistryService,
    TripNaraSystemPromptService,
    ReactSystemPromptService,
    AgentInfraModule, // 导出 Infra 模块（LLMExecutor、CoreGateway）
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
      const readinessActions = createReadinessActions(this.readinessService);
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

