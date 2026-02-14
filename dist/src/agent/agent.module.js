"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentModule = void 0;
const common_1 = require("@nestjs/common");
const agent_controller_1 = require("./agent.controller");
const agent_service_1 = require("./services/agent.service");
const router_service_1 = require("./services/router.service");
const agent_state_service_1 = require("./services/agent-state.service");
const action_registry_service_1 = require("./services/action-registry.service");
const system1_executor_service_1 = require("./services/system1-executor.service");
const system1_info_card_service_1 = require("./services/system1-info-card.service");
const system_collaboration_service_1 = require("./services/system-collaboration.service");
const hallucination_detection_service_1 = require("./services/hallucination-detection.service");
const orchestrator_service_1 = require("./services/orchestrator.service");
const critic_service_1 = require("./services/critic.service");
const event_telemetry_service_1 = require("./services/event-telemetry.service");
const action_cache_service_1 = require("./services/action-cache.service");
const request_deduplication_service_1 = require("./services/request-deduplication.service");
const action_dependency_analyzer_service_1 = require("./services/action-dependency-analyzer.service");
const llm_plan_service_1 = require("./services/llm-plan-service");
const webbrowse_executor_service_1 = require("./services/webbrowse-executor.service");
const llm_module_1 = require("../llm/llm.module");
const places_module_1 = require("../places/places.module");
const trips_module_1 = require("../trips/trips.module");
const itinerary_items_module_1 = require("../itinerary-items/itinerary-items.module");
const itinerary_optimization_module_1 = require("../itinerary-optimization/itinerary-optimization.module");
const transport_module_1 = require("../transport/transport.module");
const planning_policy_module_1 = require("../planning-policy/planning-policy.module");
const railpass_module_1 = require("../railpass/railpass.module");
const readiness_module_1 = require("../trips/readiness/readiness.module");
const decision_module_1 = require("../trips/decision/decision.module");
const memory_module_1 = require("./memory/memory.module");
const rag_module_1 = require("../rag/rag.module");
const places_service_1 = require("../places/places.service");
const trips_service_1 = require("../trips/trips.service");
const itinerary_items_service_1 = require("../itinerary-items/itinerary-items.service");
const vector_search_service_1 = require("../places/services/vector-search.service");
const entity_resolution_service_1 = require("../places/services/entity-resolution.service");
const transport_routing_service_1 = require("../transport/transport-routing.service");
const enhanced_vrptw_optimizer_service_1 = require("../itinerary-optimization/services/enhanced-vrptw-optimizer.service");
const feasibility_service_1 = require("../planning-policy/services/feasibility.service");
const railpass_service_1 = require("../railpass/railpass.service");
const trip_actions_1 = require("./services/actions/trip.actions");
const places_actions_1 = require("./services/actions/places.actions");
const transport_actions_1 = require("./services/actions/transport.actions");
const itinerary_actions_1 = require("./services/actions/itinerary.actions");
const policy_actions_1 = require("./services/actions/policy.actions");
const webbrowse_actions_1 = require("./services/actions/webbrowse.actions");
const railpass_agent_actions_1 = require("../railpass/actions/railpass-agent-actions");
const readiness_actions_1 = require("./services/actions/readiness.actions");
const readiness_service_1 = require("../trips/readiness/services/readiness.service");
const planning_actions_1 = require("./services/actions/planning.actions");
const execution_actions_1 = require("./services/actions/execution.actions");
const trip_detail_actions_1 = require("./services/actions/trip-detail.actions");
const tripnara_system_prompt_service_1 = require("./services/tripnara-system-prompt.service");
const react_system_prompt_service_1 = require("./services/react-system-prompt.service");
const plan_execute_module_1 = require("./plan-execute/plan-execute.module");
const claude_orchestrator_service_1 = require("./services/claude-orchestrator.service");
const persona_shell_service_1 = require("./services/persona-shell.service");
const planning_workbench_agent_service_1 = require("./services/planning-workbench-agent.service");
const planning_workbench_admin_service_1 = require("./services/planning-workbench-admin.service");
const execution_agent_service_1 = require("./services/execution-agent.service");
const trip_detail_agent_service_1 = require("./services/trip-detail-agent.service");
const execution_controller_1 = require("./execution.controller");
const trip_detail_controller_1 = require("./trip-detail.controller");
const planning_workbench_controller_1 = require("./planning-workbench.controller");
const agent_admin_controller_1 = require("./agent-admin.controller");
const agent_run_admin_service_1 = require("./services/agent-run-admin.service");
const trip_run_manager_service_1 = require("./services/trip-run-manager.service");
const skills_module_1 = require("../skills/skills.module");
const planner_agent_service_1 = require("./services/sub-agents/planner-agent.service");
const gatekeeper_agent_service_1 = require("./services/sub-agents/gatekeeper-agent.service");
const compliance_agent_service_1 = require("./services/sub-agents/compliance-agent.service");
const local_insight_agent_service_1 = require("./services/sub-agents/local-insight-agent.service");
const core_decision_agent_service_1 = require("./services/sub-agents/core-decision-agent.service");
const narrator_agent_service_1 = require("./services/sub-agents/narrator-agent.service");
const skill_input_validator_service_1 = require("./services/skill-input-validator.service");
const skill_input_schema_generator_service_1 = require("./services/skill-input-schema-generator.service");
const assistants_module_1 = require("./assistants/assistants.module");
const infra_module_1 = require("./infra/infra.module");
const route_directions_module_1 = require("../route-directions/route-directions.module");
const data_modeling_module_1 = require("../data-modeling/data-modeling.module");
const prisma_module_1 = require("../prisma/prisma.module");
const training_module_1 = require("./training/training.module");
const decision_draft_module_1 = require("../decision-draft/decision-draft.module");
const postgresql_mcp_module_1 = require("../mcp/postgresql-mcp.module");
let AgentModule = class AgentModule {
    constructor(placesService, tripsService, itineraryItemsService, webBrowseExecutor, actionRegistry, vectorSearchService, entityResolutionService, transportRoutingService, vrptwOptimizer, feasibilityService, railPassService, readinessService, planningWorkbenchAgent, executionAgent, tripDetailAgent) {
        this.placesService = placesService;
        this.tripsService = tripsService;
        this.itineraryItemsService = itineraryItemsService;
        this.webBrowseExecutor = webBrowseExecutor;
        this.actionRegistry = actionRegistry;
        this.vectorSearchService = vectorSearchService;
        this.entityResolutionService = entityResolutionService;
        this.transportRoutingService = transportRoutingService;
        this.vrptwOptimizer = vrptwOptimizer;
        this.feasibilityService = feasibilityService;
        this.railPassService = railPassService;
        this.readinessService = readinessService;
        this.planningWorkbenchAgent = planningWorkbenchAgent;
        this.executionAgent = executionAgent;
        this.tripDetailAgent = tripDetailAgent;
        this.registerBasicActions();
    }
    registerBasicActions() {
        if (!this.actionRegistry) {
            return;
        }
        const tripActions = (0, trip_actions_1.createTripActions)(this.tripsService, this.itineraryItemsService);
        this.actionRegistry.registerMany(tripActions);
        const placesActions = (0, places_actions_1.createPlacesActions)(this.placesService, this.vectorSearchService, this.entityResolutionService);
        this.actionRegistry.registerMany(placesActions);
        if (this.transportRoutingService) {
            const transportActions = (0, transport_actions_1.createTransportActions)(this.transportRoutingService);
            this.actionRegistry.registerMany(transportActions);
        }
        if (this.vrptwOptimizer) {
            const itineraryActions = (0, itinerary_actions_1.createItineraryActions)(this.vrptwOptimizer);
            this.actionRegistry.registerMany(itineraryActions);
        }
        if (this.feasibilityService) {
            const policyActions = (0, policy_actions_1.createPolicyActions)(this.feasibilityService);
            this.actionRegistry.registerMany(policyActions);
        }
        const webBrowseActions = (0, webbrowse_actions_1.createWebBrowseActions)(this.webBrowseExecutor);
        this.actionRegistry.registerMany(webBrowseActions);
        if (this.railPassService) {
            const railPassActions = (0, railpass_agent_actions_1.createRailPassActions)(this.railPassService);
            this.actionRegistry.registerMany(railPassActions);
        }
        if (this.readinessService) {
            const readinessActions = (0, readiness_actions_1.createReadinessActions)(this.readinessService);
            this.actionRegistry.registerMany(readinessActions);
        }
        if (this.planningWorkbenchAgent) {
            const planningActions = (0, planning_actions_1.createPlanningActions)(this.planningWorkbenchAgent);
            this.actionRegistry.registerMany(planningActions);
        }
        if (this.executionAgent) {
            const executionActions = (0, execution_actions_1.createExecutionActions)(this.executionAgent);
            this.actionRegistry.registerMany(executionActions);
        }
        if (this.tripDetailAgent) {
            const tripDetailActions = (0, trip_detail_actions_1.createTripDetailActions)(this.tripDetailAgent);
            this.actionRegistry.registerMany(tripDetailActions);
        }
    }
};
exports.AgentModule = AgentModule;
exports.AgentModule = AgentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            llm_module_1.LlmModule,
            (0, common_1.forwardRef)(() => places_module_1.PlacesModule),
            (0, common_1.forwardRef)(() => trips_module_1.TripsModule),
            itinerary_items_module_1.ItineraryItemsModule,
            itinerary_optimization_module_1.ItineraryOptimizationModule,
            transport_module_1.TransportModule,
            planning_policy_module_1.PlanningPolicyModule,
            railpass_module_1.RailPassModule,
            readiness_module_1.ReadinessModule,
            decision_module_1.DecisionModule,
            memory_module_1.MemoryModule,
            (0, common_1.forwardRef)(() => rag_module_1.RagModule),
            plan_execute_module_1.PlanExecuteModule,
            (0, common_1.forwardRef)(() => skills_module_1.SkillsModule),
            assistants_module_1.AssistantsModule,
            infra_module_1.AgentInfraModule,
            route_directions_module_1.RouteDirectionsModule,
            data_modeling_module_1.DataModelingModule,
            prisma_module_1.PrismaModule,
            training_module_1.TrainingModule,
            (0, common_1.forwardRef)(() => decision_draft_module_1.DecisionDraftModule),
            postgresql_mcp_module_1.PostgreSQLMcpModule,
        ],
        controllers: [agent_controller_1.AgentController, planning_workbench_controller_1.PlanningWorkbenchController, execution_controller_1.ExecutionController, trip_detail_controller_1.TripDetailController, agent_admin_controller_1.AgentAdminController],
        providers: [
            agent_service_1.AgentService,
            router_service_1.RouterService,
            agent_state_service_1.AgentStateService,
            action_registry_service_1.ActionRegistryService,
            system1_executor_service_1.System1ExecutorService,
            system1_info_card_service_1.System1InfoCardService,
            system_collaboration_service_1.SystemCollaborationService,
            hallucination_detection_service_1.HallucinationDetectionService,
            orchestrator_service_1.OrchestratorService,
            critic_service_1.CriticService,
            event_telemetry_service_1.EventTelemetryService,
            action_cache_service_1.ActionCacheService,
            request_deduplication_service_1.RequestDeduplicationService,
            action_dependency_analyzer_service_1.ActionDependencyAnalyzerService,
            llm_plan_service_1.LlmPlanService,
            webbrowse_executor_service_1.WebBrowseExecutorService,
            tripnara_system_prompt_service_1.TripNaraSystemPromptService,
            react_system_prompt_service_1.ReactSystemPromptService,
            claude_orchestrator_service_1.ClaudeOrchestratorService,
            persona_shell_service_1.PersonaShellService,
            planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
            planning_workbench_admin_service_1.PlanningWorkbenchAdminService,
            execution_agent_service_1.ExecutionAgentService,
            trip_detail_agent_service_1.TripDetailAgentService,
            planner_agent_service_1.ClaudePlannerAgentService,
            gatekeeper_agent_service_1.ClaudeGatekeeperAgentService,
            compliance_agent_service_1.ClaudeComplianceAgentService,
            local_insight_agent_service_1.ClaudeLocalInsightAgentService,
            core_decision_agent_service_1.ClaudeCoreDecisionAgentService,
            narrator_agent_service_1.ClaudeNarratorAgentService,
            skill_input_validator_service_1.SkillInputValidatorService,
            skill_input_schema_generator_service_1.SkillInputSchemaGeneratorService,
            agent_run_admin_service_1.AgentRunAdminService,
            trip_run_manager_service_1.TripRunManagerService,
        ],
        exports: [
            agent_service_1.AgentService,
            action_registry_service_1.ActionRegistryService,
            tripnara_system_prompt_service_1.TripNaraSystemPromptService,
            react_system_prompt_service_1.ReactSystemPromptService,
            infra_module_1.AgentInfraModule,
        ],
    }),
    __param(4, (0, common_1.Optional)()),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [places_service_1.PlacesService,
        trips_service_1.TripsService,
        itinerary_items_service_1.ItineraryItemsService,
        webbrowse_executor_service_1.WebBrowseExecutorService,
        action_registry_service_1.ActionRegistryService,
        vector_search_service_1.VectorSearchService,
        entity_resolution_service_1.EntityResolutionService,
        transport_routing_service_1.TransportRoutingService,
        enhanced_vrptw_optimizer_service_1.EnhancedVRPTWOptimizerService,
        feasibility_service_1.FeasibilityService,
        railpass_service_1.RailPassService,
        readiness_service_1.ReadinessService,
        planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
        execution_agent_service_1.ExecutionAgentService,
        trip_detail_agent_service_1.TripDetailAgentService])
], AgentModule);
//# sourceMappingURL=agent.module.js.map