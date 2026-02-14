"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionModule = void 0;
const common_1 = require("@nestjs/common");
const trip_decision_engine_service_1 = require("./trip-decision-engine.service");
const sense_tools_adapter_1 = require("./adapters/sense-tools.adapter");
const decision_log_clustering_service_1 = require("./evaluation/decision-log-clustering.service");
const constraint_checker_1 = require("./constraints/constraint-checker");
const constraint_dsl_compiler_service_1 = require("./constraints/constraint-dsl-compiler.service");
const constraint_conflict_resolver_service_1 = require("./constraints/constraint-conflict-resolver.service");
const multi_plan_generator_service_1 = require("./services/multi-plan-generator.service");
const feedback_collector_service_1 = require("./feedback/feedback-collector.service");
const quality_assessor_service_1 = require("./feedback/quality-assessor.service");
const memory_updater_service_1 = require("./feedback/memory-updater.service");
const decision_controller_1 = require("./decision.controller");
const decision_stats_controller_1 = require("./decision-stats.controller");
const transport_module_1 = require("../../transport/transport.module");
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
    process.env.MCP_MODE === 'true';
let PlacesModuleOrLite;
if (isMcpMode && process.env.ENABLE_FULL_PLACES_MODULE !== 'true') {
    PlacesModuleOrLite = require('../../places/places-lite.module').PlacesLiteModule;
}
else {
    PlacesModuleOrLite = require('../../places/places.module').PlacesModule;
}
const route_directions_module_1 = require("../../route-directions/route-directions.module");
const context_engine_module_1 = require("../../agent/context-engine/context-engine.module");
const skills_module_1 = require("../../skills/skills.module");
const dem_module_1 = require("../dem/dem.module");
const enableRouteDirectionsModule = process.env.ENABLE_ROUTE_DIRECTIONS_MODULE === 'true';
const enableContextEngineModule = process.env.ENABLE_CONTEXT_ENGINE_MODULE === 'true';
const enableSkillsModule = process.env.ENABLE_SKILLS_MODULE === 'true';
const strategy_orchestrator_service_1 = require("./services/strategy-orchestrator.service");
const spatial_replacement_service_1 = require("./services/spatial-replacement.service");
const spatial_issue_detector_service_1 = require("./services/spatial-issue-detector.service");
const fatigue_calculator_service_1 = require("./services/fatigue-calculator.service");
const abu_strategy_service_1 = require("./strategies/abu-strategy.service");
const dr_dre_strategy_service_1 = require("./strategies/dr-dre-strategy.service");
const neptune_strategy_service_1 = require("./strategies/neptune-strategy.service");
const decision_stats_service_1 = require("./services/decision-stats.service");
const heuristic_diet_service_1 = require("./services/heuristic-diet.service");
const decision_log_storage_service_1 = require("./services/decision-log-storage.service");
const decision_logging_service_1 = require("./services/decision-logging.service");
const readiness_agent_service_1 = require("./readiness/readiness-agent.service");
const approval_service_1 = require("./services/approval.service");
const agent_resume_service_1 = require("./services/agent-resume.service");
const approval_controller_1 = require("./controllers/approval.controller");
const decision_state_manager_service_1 = require("./services/decision-state-manager.service");
const three_layer_explanation_service_1 = require("./services/three-layer-explanation.service");
const rhythm_matching_service_1 = require("./services/rhythm-matching.service");
const multi_person_decision_service_1 = require("./services/multi-person-decision.service");
const training_module_1 = require("../../agent/training/training.module");
const exa_module_1 = require("../../mcp/exa.module");
const airbnb_module_1 = require("../../mcp/airbnb.module");
const booking_com_module_1 = require("../../mcp/booking-com.module");
let DataQualityModule;
let DataModelingModule;
try {
    DataQualityModule = require('../../data-quality/data-quality.module').DataQualityModule;
}
catch {
    DataQualityModule = null;
}
try {
    DataModelingModule = require('../../data-modeling/data-modeling.module').DataModelingModule;
}
catch {
    DataModelingModule = null;
}
let DecisionModule = class DecisionModule {
};
exports.DecisionModule = DecisionModule;
exports.DecisionModule = DecisionModule = __decorate([
    (0, common_1.Module)({
        imports: [
            transport_module_1.TransportModule,
            dem_module_1.DemModule,
            ...(DataQualityModule ? [(0, common_1.forwardRef)(() => DataQualityModule)] : []),
            ...(DataModelingModule ? [DataModelingModule] : []),
            ...(enableRouteDirectionsModule ? [(0, common_1.forwardRef)(() => route_directions_module_1.RouteDirectionsModule)] : []),
            ...(enableContextEngineModule ? [context_engine_module_1.ContextEngineModule] : []),
            ...(enableSkillsModule ? [(0, common_1.forwardRef)(() => skills_module_1.SkillsModule)] : []),
            training_module_1.TrainingModule,
            exa_module_1.ExaModule,
            airbnb_module_1.AirbnbModule,
            booking_com_module_1.BookingComModule,
        ],
        controllers: [
            decision_controller_1.DecisionController,
            decision_stats_controller_1.DecisionStatsController,
            approval_controller_1.ApprovalController,
        ],
        providers: [
            trip_decision_engine_service_1.TripDecisionEngineService,
            sense_tools_adapter_1.SenseToolsAdapter,
            constraint_checker_1.ConstraintChecker,
            constraint_dsl_compiler_service_1.ConstraintDSLCompiler,
            constraint_conflict_resolver_service_1.ConstraintConflictResolver,
            multi_plan_generator_service_1.MultiPlanGenerator,
            feedback_collector_service_1.FeedbackCollectorService,
            quality_assessor_service_1.QualityAssessorService,
            memory_updater_service_1.MemoryUpdaterService,
            strategy_orchestrator_service_1.StrategyOrchestratorService,
            spatial_replacement_service_1.SpatialReplacementService,
            spatial_issue_detector_service_1.SpatialIssueDetectorService,
            fatigue_calculator_service_1.FatigueCalculatorService,
            abu_strategy_service_1.AbuStrategy,
            dr_dre_strategy_service_1.DrDreStrategy,
            neptune_strategy_service_1.NeptuneStrategy,
            decision_stats_service_1.DecisionStatsService,
            heuristic_diet_service_1.HeuristicDietService,
            decision_log_storage_service_1.DecisionLogStorageService,
            decision_logging_service_1.DecisionLoggingService,
            decision_state_manager_service_1.DecisionStateManagerService,
            three_layer_explanation_service_1.ThreeLayerExplanationService,
            rhythm_matching_service_1.RhythmMatchingService,
            multi_person_decision_service_1.MultiPersonDecisionService,
            decision_log_clustering_service_1.DecisionLogClusteringService,
            readiness_agent_service_1.ReadinessAgentService,
            approval_service_1.ApprovalService,
            agent_resume_service_1.AgentResumeService,
        ],
        exports: [
            trip_decision_engine_service_1.TripDecisionEngineService,
            constraint_checker_1.ConstraintChecker,
            constraint_dsl_compiler_service_1.ConstraintDSLCompiler,
            constraint_conflict_resolver_service_1.ConstraintConflictResolver,
            multi_plan_generator_service_1.MultiPlanGenerator,
            feedback_collector_service_1.FeedbackCollectorService,
            quality_assessor_service_1.QualityAssessorService,
            memory_updater_service_1.MemoryUpdaterService,
            strategy_orchestrator_service_1.StrategyOrchestratorService,
            spatial_replacement_service_1.SpatialReplacementService,
            spatial_issue_detector_service_1.SpatialIssueDetectorService,
            fatigue_calculator_service_1.FatigueCalculatorService,
            abu_strategy_service_1.AbuStrategy,
            dr_dre_strategy_service_1.DrDreStrategy,
            neptune_strategy_service_1.NeptuneStrategy,
            decision_stats_service_1.DecisionStatsService,
            heuristic_diet_service_1.HeuristicDietService,
            decision_log_storage_service_1.DecisionLogStorageService,
            decision_logging_service_1.DecisionLoggingService,
            decision_state_manager_service_1.DecisionStateManagerService,
            three_layer_explanation_service_1.ThreeLayerExplanationService,
            rhythm_matching_service_1.RhythmMatchingService,
            multi_person_decision_service_1.MultiPersonDecisionService,
            decision_log_clustering_service_1.DecisionLogClusteringService,
            readiness_agent_service_1.ReadinessAgentService,
            approval_service_1.ApprovalService,
            agent_resume_service_1.AgentResumeService,
        ],
    })
], DecisionModule);
//# sourceMappingURL=decision.module.js.map