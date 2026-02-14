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
var SkillsModule_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsModule = void 0;
const common_1 = require("@nestjs/common");
const decision_module_1 = require("../trips/decision/decision.module");
const route_directions_module_1 = require("../route-directions/route-directions.module");
const readiness_module_1 = require("../trips/readiness/readiness.module");
const trips_module_1 = require("../trips/trips.module");
const context_engine_module_1 = require("../agent/context-engine/context-engine.module");
const places_module_1 = require("../places/places.module");
const places_embedding_module_1 = require("../places/places-embedding.module");
const prisma_module_1 = require("../prisma/prisma.module");
const dem_module_1 = require("../trips/dem/dem.module");
const llm_module_1 = require("../llm/llm.module");
const transport_module_1 = require("../transport/transport.module");
const data_contracts_module_1 = require("../data-contracts/data-contracts.module");
const exa_module_1 = require("../mcp/exa.module");
const cache_module_1 = require("../common/cache/cache.module");
const country_config_service_1 = require("./world/services/country-config.service");
const dem_get_profile_skill_1 = require("./dem/dem-get-profile.skill");
const decision_abu_check_skill_1 = require("./decision/decision-abu-check.skill");
const decision_drdre_pace_skill_1 = require("./decision/decision-drdre-pace.skill");
const decision_neptune_repair_skill_1 = require("./decision/decision-neptune-repair.skill");
const route_direction_pick_for_intent_skill_1 = require("./route-direction/route-direction-pick-for-intent.skill");
const route_direction_list_for_country_skill_1 = require("./route-direction/route-direction-list-for-country.skill");
const readiness_generate_checklist_skill_1 = require("./readiness/readiness-generate-checklist.skill");
const readiness_summarize_risks_skill_1 = require("./readiness/readiness-summarize-risks.skill");
const readiness_check_visa_window_skill_1 = require("./readiness/readiness-check-visa-window.skill");
const trip_quick_evaluate_skill_1 = require("./trip/trip-quick-evaluate.skill");
const world_build_context_skill_1 = require("./world/world-build-context.skill");
const world_model_evidence_controller_1 = require("./world/world-model-evidence.controller");
const world_model_evidence_service_1 = require("./world/services/world-model-evidence.service");
const world_controller_1 = require("./world/world.controller");
const world_realtime_weather_skill_1 = require("./world/world-realtime-weather.skill");
const world_weather_prediction_skill_1 = require("./world/world-weather-prediction.skill");
const world_failure_risk_prediction_skill_1 = require("./world/world-failure-risk-prediction.skill");
const world_adaptive_parameters_skill_1 = require("./world/world-adaptive-parameters.skill");
const world_multimodal_perception_skill_1 = require("./world/world-multimodal-perception.skill");
const world_collaborative_data_skill_1 = require("./world/world-collaborative-data.skill");
const collaborative_world_model_service_1 = require("./world/services/collaborative-world-model.service");
const causal_reasoning_service_1 = require("./world/services/causal-reasoning.service");
const multi_agent_collaboration_service_1 = require("./world/services/multi-agent-collaboration.service");
const world_model_version_service_1 = require("./world/services/world-model-version.service");
const world_model_events_service_1 = require("./world/services/world-model-events.service");
const world_model_monitoring_service_1 = require("./world/services/world-model-monitoring.service");
const f_road_check_skill_1 = require("./world/f-road-check.skill");
const weather_alert_skill_1 = require("./world/weather-alert.skill");
const avalanche_risk_assessment_skill_1 = require("./world/avalanche-risk-assessment.skill");
const road_status_realtime_service_1 = require("./world/services/road-status-realtime.service");
const iceland_weather_realtime_service_1 = require("./world/services/iceland-weather-realtime.service");
const unified_world_model_service_1 = require("./world/services/unified-world-model.service");
const decision_run_three_guardians_skill_1 = require("./decision/decision-run-three-guardians.skill");
const decision_explain_for_human_skill_1 = require("./decision/decision-explain-for-human.skill");
const country_pack_new_skeleton_skill_1 = require("./country-pack/country-pack-new-skeleton.skill");
const country_pack_validate_skill_1 = require("./country-pack/country-pack-validate.skill");
const country_pack_generate_regression_tests_skill_1 = require("./country-pack/country-pack-generate-regression-tests.skill");
const country_pack_suggest_improvements_skill_1 = require("./country-pack/country-pack-suggest-improvements.skill");
const country_pack_get_blocks_skill_1 = require("./country-pack/country-pack-get-blocks.skill");
const country_pack_rank_blocks_skill_1 = require("./country-pack/country-pack-rank-blocks.skill");
const route_pack_new_skeleton_skill_1 = require("./route-pack/route-pack-new-skeleton.skill");
const route_pack_validate_skill_1 = require("./route-pack/route-pack-validate.skill");
const route_pack_generate_regression_tests_skill_1 = require("./route-pack/route-pack-generate-regression-tests.skill");
const context_build_skill_1 = require("./context/context-build.skill");
const context_compress_skill_1 = require("./context/context-compress.skill");
const context_evaluate_skill_1 = require("./context/context-evaluate.skill");
const context_regression_tests_skill_1 = require("./context/context-regression-tests.skill");
const plan_select_slices_skill_1 = require("./context/plan-select-slices.skill");
const tools_select_skill_1 = require("./context/tools-select.skill");
const context_compile_package_skill_1 = require("./context/context-compile-package.skill");
const geo_find_nearby_poi_skill_1 = require("./geo/geo-find-nearby-poi.skill");
const geo_sample_elevation_profile_skill_1 = require("./geo/geo-sample-elevation-profile.skill");
const geo_find_candidate_within_corridor_skill_1 = require("./geo/geo-find-candidate-within-corridor.skill");
const geo_check_hazard_zones_skill_1 = require("./geo/geo-check-hazard-zones.skill");
const transport_search_skill_1 = require("./transport/transport-search.skill");
const poi_search_skill_1 = require("./places/poi-search.skill");
const opening_hours_get_skill_1 = require("./places/opening-hours-get.skill");
const weather_search_skill_1 = require("./weather/weather-search.skill");
const web_browse_skill_1 = require("./web/web-browse.skill");
const itinerary_generate_skill_1 = require("./itinerary/itinerary-generate.skill");
const itinerary_verify_skill_1 = require("./itinerary/itinerary-verify.skill");
const repair_apply_skill_1 = require("./itinerary/repair-apply.skill");
const plan_architect_generate_skeleton_skill_1 = require("./plan/architect/plan-architect-generate-skeleton.skill");
const plan_architect_compare_options_skill_1 = require("./plan/architect/plan-architect-compare-options.skill");
const plan_architect_commit_option_skill_1 = require("./plan/architect/plan-architect-commit-option.skill");
const plan_budget_estimate_baseline_skill_1 = require("./plan/budget/plan-budget-estimate-baseline.skill");
const plan_budget_detect_overrun_skill_1 = require("./plan/budget/plan-budget-detect-overrun.skill");
const plan_budget_propose_tradeoffs_skill_1 = require("./plan/budget/plan-budget-propose-tradeoffs.skill");
const plan_transit_build_transfer_graph_skill_1 = require("./plan/transit/plan-transit-build-transfer-graph.skill");
const plan_transit_suggest_modes_skill_1 = require("./plan/transit/plan-transit-suggest-modes.skill");
const plan_transit_generate_plan_b_skill_1 = require("./plan/transit/plan-transit-generate-plan-b.skill");
const plan_pace_compute_time_windows_skill_1 = require("./plan/pace/plan-pace-compute-time-windows.skill");
const plan_pace_fatigue_score_skill_1 = require("./plan/pace/plan-pace-fatigue-score.skill");
const plan_pace_adjust_schedule_skill_1 = require("./plan/pace/plan-pace-adjust-schedule.skill");
const plan_gate_precheck_skill_1 = require("./plan/gate/plan-gate-precheck.skill");
const plan_gate_run_three_guardians_skill_1 = require("./plan/gate/plan-gate-run-three-guardians.skill");
const plan_gate_propose_safe_alternatives_skill_1 = require("./plan/gate/plan-gate-propose-safe-alternatives.skill");
const plan_evidence_build_envelope_skill_1 = require("./plan/evidence/plan-evidence-build-envelope.skill");
const plan_constraints_detect_conflicts_skill_1 = require("./plan/constraints/plan-constraints-detect-conflicts.skill");
const plan_constraints_arbitrate_tradeoffs_skill_1 = require("./plan/constraints/plan-constraints-arbitrate-tradeoffs.skill");
const plan_log_append_decision_skill_1 = require("./plan/log/plan-log-append-decision.skill");
const exec_remind_skill_1 = require("./exec/exec-remind.skill");
const exec_handle_change_skill_1 = require("./exec/exec-handle-change.skill");
const exec_fallback_skill_1 = require("./exec/exec-fallback.skill");
const detail_understand_status_skill_1 = require("./detail/detail-understand-status.skill");
const detail_analyze_health_skill_1 = require("./detail/detail-analyze-health.skill");
const detail_explain_decision_skill_1 = require("./detail/detail-explain-decision.skill");
const detail_show_evidence_skill_1 = require("./detail/detail-show-evidence.skill");
const decision_log_append_skill_1 = require("./decision/decision-log-append.skill");
const decision_stage_skill_1 = require("./decision/decision-stage.skill");
const decision_replay_skill_1 = require("./decision/decision-replay.skill");
const skills_registry_service_1 = require("./services/skills-registry.service");
const skill_scanner_service_1 = require("./services/skill-scanner.service");
const skills_registry_token_1 = require("./services/skills-registry.token");
const decision_request_approval_skill_1 = require("./hitl/decision-request-approval.skill");
const decision_check_approval_skill_1 = require("./hitl/decision-check-approval.skill");
const hitl_create_approval_task_skill_1 = require("./hitl/hitl-create-approval-task.skill");
const hitl_resolve_approval_task_skill_1 = require("./hitl/hitl-resolve-approval-task.skill");
const approval_storage_service_1 = require("./hitl/services/approval-storage.service");
const skills_tokens_1 = require("./skills.tokens");
const enableDecisionSkills = process.env.ENABLE_DECISION_SKILLS === 'true';
const enableReadinessChecklistSkill = enableDecisionSkills;
const enableReadinessModule = process.env.ENABLE_READINESS_MODULE === 'true';
const enableTripsModule = process.env.ENABLE_TRIPS_MODULE === 'true';
const enablePlacesEmbeddingModule = process.env.ENABLE_PLACES_EMBEDDING_MODULE !== 'false';
const enableContextEngineModule = process.env.ENABLE_CONTEXT_ENGINE_MODULE !== 'false';
const enablePlacesModule = process.env.ENABLE_PLACES_MODULE === 'true';
let SkillsModule = SkillsModule_1 = class SkillsModule {
    constructor(skillScanner, skillsRegistry, decisionStageSkill, decisionReplaySkill, contextCompilePackageSkill, geoFindNearbyPOISkill, geoSampleElevationProfileSkill, geoFindCandidateWithinCorridorSkill, geoCheckHazardZonesSkill, transportSearchSkill, poiSearchSkill, openingHoursGetSkill, weatherSearchSkill, webBrowseSkill, itineraryGenerateSkill, itineraryVerifySkill, repairApplySkill, routePackNewSkeletonSkill, routePackValidateSkill, routePackGenerateRegressionTestsSkill, hitlCreateApprovalTaskSkill, hitlResolveApprovalTaskSkill, planGateRunThreeGuardiansSkill, planGatePrecheckSkill, planGateProposeSafeAlternativesSkill) {
        this.skillScanner = skillScanner;
        this.skillsRegistry = skillsRegistry;
        this.decisionStageSkill = decisionStageSkill;
        this.decisionReplaySkill = decisionReplaySkill;
        this.contextCompilePackageSkill = contextCompilePackageSkill;
        this.geoFindNearbyPOISkill = geoFindNearbyPOISkill;
        this.geoSampleElevationProfileSkill = geoSampleElevationProfileSkill;
        this.geoFindCandidateWithinCorridorSkill = geoFindCandidateWithinCorridorSkill;
        this.geoCheckHazardZonesSkill = geoCheckHazardZonesSkill;
        this.transportSearchSkill = transportSearchSkill;
        this.poiSearchSkill = poiSearchSkill;
        this.openingHoursGetSkill = openingHoursGetSkill;
        this.weatherSearchSkill = weatherSearchSkill;
        this.webBrowseSkill = webBrowseSkill;
        this.itineraryGenerateSkill = itineraryGenerateSkill;
        this.itineraryVerifySkill = itineraryVerifySkill;
        this.repairApplySkill = repairApplySkill;
        this.routePackNewSkeletonSkill = routePackNewSkeletonSkill;
        this.routePackValidateSkill = routePackValidateSkill;
        this.routePackGenerateRegressionTestsSkill = routePackGenerateRegressionTestsSkill;
        this.hitlCreateApprovalTaskSkill = hitlCreateApprovalTaskSkill;
        this.hitlResolveApprovalTaskSkill = hitlResolveApprovalTaskSkill;
        this.planGateRunThreeGuardiansSkill = planGateRunThreeGuardiansSkill;
        this.planGatePrecheckSkill = planGatePrecheckSkill;
        this.planGateProposeSafeAlternativesSkill = planGateProposeSafeAlternativesSkill;
        this.logger = new common_1.Logger(SkillsModule_1.name);
        this.logger.log('[SkillsModule] 构造函数开始执行...');
        if (this.decisionStageSkill) {
            this.skillsRegistry.registerSkill(this.decisionStageSkill);
            this.logger.debug('Registered DecisionStageSkill');
        }
        if (this.decisionReplaySkill) {
            this.skillsRegistry.registerSkill(this.decisionReplaySkill);
            this.logger.debug('Registered DecisionReplaySkill');
        }
        if (this.contextCompilePackageSkill) {
            this.skillsRegistry.registerSkill(this.contextCompilePackageSkill);
            this.logger.debug('Registered ContextCompilePackageSkill');
        }
        if (this.geoFindNearbyPOISkill) {
            this.skillsRegistry.registerSkill(this.geoFindNearbyPOISkill);
            this.logger.debug('Registered GeoFindNearbyPOISkill');
        }
        if (this.geoSampleElevationProfileSkill) {
            this.skillsRegistry.registerSkill(this.geoSampleElevationProfileSkill);
            this.logger.debug('Registered GeoSampleElevationProfileSkill');
        }
        if (this.geoFindCandidateWithinCorridorSkill) {
            this.skillsRegistry.registerSkill(this.geoFindCandidateWithinCorridorSkill);
            this.logger.debug('Registered GeoFindCandidateWithinCorridorSkill');
        }
        if (this.geoCheckHazardZonesSkill) {
            this.skillsRegistry.registerSkill(this.geoCheckHazardZonesSkill);
            this.logger.debug('Registered GeoCheckHazardZonesSkill');
        }
        if (this.transportSearchSkill) {
            this.skillsRegistry.registerSkill(this.transportSearchSkill);
            this.logger.debug('Registered TransportSearchSkill');
        }
        if (this.poiSearchSkill) {
            this.skillsRegistry.registerSkill(this.poiSearchSkill);
            this.logger.debug('Registered PoiSearchSkill');
        }
        if (this.openingHoursGetSkill) {
            this.skillsRegistry.registerSkill(this.openingHoursGetSkill);
            this.logger.debug('Registered OpeningHoursGetSkill');
        }
        if (this.weatherSearchSkill) {
            this.skillsRegistry.registerSkill(this.weatherSearchSkill);
            this.logger.debug('Registered WeatherSearchSkill');
        }
        if (this.webBrowseSkill) {
            this.skillsRegistry.registerSkill(this.webBrowseSkill);
            this.logger.debug('Registered WebBrowseSkill');
        }
        if (this.itineraryGenerateSkill) {
            this.skillsRegistry.registerSkill(this.itineraryGenerateSkill);
            this.logger.debug('Registered ItineraryGenerateSkill');
        }
        if (this.itineraryVerifySkill) {
            this.skillsRegistry.registerSkill(this.itineraryVerifySkill);
            this.logger.debug('Registered ItineraryVerifySkill');
        }
        if (this.repairApplySkill) {
            this.skillsRegistry.registerSkill(this.repairApplySkill);
            this.logger.debug('Registered RepairApplySkill');
        }
        if (this.routePackNewSkeletonSkill) {
            this.skillsRegistry.registerSkill(this.routePackNewSkeletonSkill);
            this.logger.debug('Registered RoutePackNewSkeletonSkill');
        }
        if (this.routePackValidateSkill) {
            this.skillsRegistry.registerSkill(this.routePackValidateSkill);
            this.logger.debug('Registered RoutePackValidateSkill');
        }
        if (this.routePackGenerateRegressionTestsSkill) {
            this.skillsRegistry.registerSkill(this.routePackGenerateRegressionTestsSkill);
            this.logger.debug('Registered RoutePackGenerateRegressionTestsSkill');
        }
        if (this.hitlCreateApprovalTaskSkill) {
            this.skillsRegistry.registerSkill(this.hitlCreateApprovalTaskSkill);
            this.logger.debug('Registered HitlCreateApprovalTaskSkill');
        }
        if (this.hitlResolveApprovalTaskSkill) {
            this.skillsRegistry.registerSkill(this.hitlResolveApprovalTaskSkill);
            this.logger.debug('Registered HitlResolveApprovalTaskSkill');
        }
        if (this.planGatePrecheckSkill) {
            this.skillsRegistry.registerSkill(this.planGatePrecheckSkill);
            this.logger.debug('Registered PlanGatePrecheckSkill');
        }
        if (this.planGateRunThreeGuardiansSkill) {
            this.skillsRegistry.registerSkill(this.planGateRunThreeGuardiansSkill);
            this.logger.debug('Registered PlanGateRunThreeGuardiansSkill');
        }
        if (this.planGateProposeSafeAlternativesSkill) {
            this.skillsRegistry.registerSkill(this.planGateProposeSafeAlternativesSkill);
            this.logger.debug('Registered PlanGateProposeSafeAlternativesSkill');
        }
        const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
            process.env.MCP_MODE === 'true';
        if (isMcpMode && process.env.ENABLE_SKILL_SCAN_IN_CONSTRUCTOR === 'true') {
            setImmediate(() => {
                this.logger.log('[SkillsModule] 在构造函数中执行 Skill 扫描（延迟）...');
            });
        }
        this.logger.log('[SkillsModule] 构造函数执行完成');
    }
    async _onModuleInit_DISABLED() {
        const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
            process.env.MCP_MODE === 'true';
        if (isMcpMode && process.env.DISABLE_SKILL_SCAN === 'true') {
            this.logger.log('[SkillsModule] Skill 扫描已禁用（DISABLE_SKILL_SCAN=true），直接返回');
            return;
        }
        try {
            const skillClasses = [
                decision_request_approval_skill_1.DecisionRequestApprovalSkill,
                decision_check_approval_skill_1.DecisionCheckApprovalSkill,
            ];
            this.logger.log(`[SkillsModule] 准备扫描 ${skillClasses.length} 个 Skill 类...`);
            const timeoutMs = isMcpMode ? 2000 : 5000;
            const scanPromise = this.skillScanner.scanAndRegisterSkills(skillClasses);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => {
                this.logger.warn(`[SkillsModule] scanAndRegisterSkills 超时（${timeoutMs}ms），继续启动...`);
                reject(new Error(`scanAndRegisterSkills timeout after ${timeoutMs}ms`));
            }, timeoutMs));
            try {
                await Promise.race([scanPromise, timeoutPromise]);
                this.logger.log('[SkillsModule] onModuleInit() 扫描完成');
            }
            catch (timeoutError) {
                if (timeoutError.message.includes('timeout')) {
                    this.logger.warn('[SkillsModule] 扫描超时，但继续启动（Skills 可以在运行时注册）');
                }
                else {
                    this.logger.error(`[SkillsModule] 扫描失败: ${timeoutError.message}`);
                }
            }
        }
        catch (error) {
            this.logger.error(`[SkillsModule] onModuleInit() 执行失败: ${error.message}`, error.stack);
        }
        this.logger.log('[SkillsModule] onModuleInit() 方法结束（无论成功或失败）');
    }
};
exports.SkillsModule = SkillsModule;
exports.SkillsModule = SkillsModule = SkillsModule_1 = __decorate([
    (0, common_1.Module)({
        imports: [
            ...(enablePlacesEmbeddingModule ? [(0, common_1.forwardRef)(() => places_embedding_module_1.PlacesEmbeddingModule)] : []),
            ...(enablePlacesModule ? [(0, common_1.forwardRef)(() => places_module_1.PlacesModule)] : []),
            (0, common_1.forwardRef)(() => dem_module_1.DemModule),
            ...(enableDecisionSkills ? [(0, common_1.forwardRef)(() => decision_module_1.DecisionModule)] : []),
            ...(process.env.ENABLE_ROUTE_DIRECTIONS_MODULE === 'true' ? [(0, common_1.forwardRef)(() => route_directions_module_1.RouteDirectionsModule)] : []),
            ...(enableReadinessModule ? [(0, common_1.forwardRef)(() => readiness_module_1.ReadinessModule)] : []),
            ...(enableTripsModule ? [(0, common_1.forwardRef)(() => trips_module_1.TripsModule)] : []),
            ...(enableContextEngineModule ? [(0, common_1.forwardRef)(() => context_engine_module_1.ContextEngineModule)] : []),
            (0, common_1.forwardRef)(() => transport_module_1.TransportModule),
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => llm_module_1.LlmModule),
            (0, common_1.forwardRef)(() => data_contracts_module_1.DataContractsModule),
            exa_module_1.ExaModule,
            cache_module_1.CacheModule,
        ],
        controllers: [
            world_controller_1.WorldController,
            world_model_evidence_controller_1.WorldModelEvidenceController,
        ],
        providers: [
            ...(enableReadinessModule
                ? [
                    dem_get_profile_skill_1.DemGetProfileSkill,
                    { provide: skills_tokens_1.SKILL_DEM_GET_PROFILE, useExisting: dem_get_profile_skill_1.DemGetProfileSkill },
                ]
                : []),
            country_config_service_1.CountryConfigService,
            world_build_context_skill_1.WorldBuildContextSkill,
            { provide: skills_tokens_1.SKILL_WORLD_BUILD_CONTEXT, useExisting: world_build_context_skill_1.WorldBuildContextSkill },
            world_model_evidence_service_1.WorldModelEvidenceService,
            world_model_evidence_service_1.WorldModelEvidenceService,
            collaborative_world_model_service_1.CollaborativeWorldModelService,
            causal_reasoning_service_1.CausalReasoningService,
            multi_agent_collaboration_service_1.MultiAgentCollaborationService,
            world_model_version_service_1.WorldModelVersionService,
            world_model_events_service_1.WorldModelEventsService,
            world_model_monitoring_service_1.WorldModelMonitoringService,
            world_realtime_weather_skill_1.WorldRealtimeWeatherSkill,
            world_weather_prediction_skill_1.WorldWeatherPredictionSkill,
            world_failure_risk_prediction_skill_1.WorldFailureRiskPredictionSkill,
            world_adaptive_parameters_skill_1.WorldAdaptiveParametersSkill,
            world_multimodal_perception_skill_1.WorldMultimodalPerceptionSkill,
            world_collaborative_data_skill_1.WorldCollaborativeDataSkill,
            road_status_realtime_service_1.RoadStatusRealtimeService,
            iceland_weather_realtime_service_1.IcelandWeatherRealtimeService,
            unified_world_model_service_1.UnifiedWorldModelService,
            f_road_check_skill_1.FRoadCheckSkill,
            weather_alert_skill_1.WeatherAlertSkill,
            avalanche_risk_assessment_skill_1.AvalancheRiskAssessmentSkill,
            ...(enableDecisionSkills
                ? [
                    decision_abu_check_skill_1.DecisionAbuCheckSkill,
                    decision_drdre_pace_skill_1.DecisionDrdrePaceSkill,
                    decision_neptune_repair_skill_1.DecisionNeptuneRepairSkill,
                    decision_run_three_guardians_skill_1.DecisionRunThreeGuardiansSkill,
                    decision_explain_for_human_skill_1.DecisionExplainForHumanSkill,
                ]
                : []),
            ...(enableDecisionSkills
                ? [
                    { provide: skills_tokens_1.SKILL_DECISION_ABU_CHECK, useExisting: decision_abu_check_skill_1.DecisionAbuCheckSkill },
                    { provide: skills_tokens_1.SKILL_DECISION_DRDRE_PACE, useExisting: decision_drdre_pace_skill_1.DecisionDrdrePaceSkill },
                    { provide: skills_tokens_1.SKILL_DECISION_NEPTUNE_REPAIR, useExisting: decision_neptune_repair_skill_1.DecisionNeptuneRepairSkill },
                    { provide: skills_tokens_1.SKILL_DECISION_RUN_THREE_GUARDIANS, useExisting: decision_run_three_guardians_skill_1.DecisionRunThreeGuardiansSkill },
                    { provide: skills_tokens_1.SKILL_DECISION_EXPLAIN_FOR_HUMAN, useExisting: decision_explain_for_human_skill_1.DecisionExplainForHumanSkill },
                ]
                : []),
            route_direction_pick_for_intent_skill_1.RouteDirectionPickForIntentSkill,
            route_direction_list_for_country_skill_1.RouteDirectionListForCountrySkill,
            { provide: skills_tokens_1.SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT, useExisting: route_direction_pick_for_intent_skill_1.RouteDirectionPickForIntentSkill },
            { provide: skills_tokens_1.SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY, useExisting: route_direction_list_for_country_skill_1.RouteDirectionListForCountrySkill },
            ...(enableReadinessChecklistSkill && enableReadinessModule
                ? [readiness_generate_checklist_skill_1.ReadinessGenerateChecklistSkill, readiness_summarize_risks_skill_1.ReadinessSummarizeRisksSkill, readiness_check_visa_window_skill_1.ReadinessCheckVisaWindowSkill]
                : []),
            ...(enableReadinessChecklistSkill && enableReadinessModule
                ? [
                    { provide: skills_tokens_1.SKILL_READINESS_GENERATE_CHECKLIST, useExisting: readiness_generate_checklist_skill_1.ReadinessGenerateChecklistSkill },
                    { provide: skills_tokens_1.SKILL_READINESS_SUMMARIZE_RISKS, useExisting: readiness_summarize_risks_skill_1.ReadinessSummarizeRisksSkill },
                    { provide: skills_tokens_1.SKILL_READINESS_CHECK_VISA_WINDOW, useExisting: readiness_check_visa_window_skill_1.ReadinessCheckVisaWindowSkill },
                ]
                : []),
            ...(enableTripsModule
                ? [
                    trip_quick_evaluate_skill_1.TripQuickEvaluateSkill,
                    { provide: skills_tokens_1.SKILL_TRIP_QUICK_EVALUATE, useExisting: trip_quick_evaluate_skill_1.TripQuickEvaluateSkill },
                ]
                : []),
            country_pack_new_skeleton_skill_1.CountryPackNewSkeletonSkill,
            country_pack_validate_skill_1.CountryPackValidateSkill,
            country_pack_generate_regression_tests_skill_1.CountryPackGenerateRegressionTestsSkill,
            country_pack_suggest_improvements_skill_1.CountryPackSuggestImprovementsSkill,
            country_pack_get_blocks_skill_1.CountryPackGetBlocksSkill,
            country_pack_rank_blocks_skill_1.CountryPackRankBlocksSkill,
            { provide: skills_tokens_1.SKILL_COUNTRY_PACK_NEW_SKELETON, useExisting: country_pack_new_skeleton_skill_1.CountryPackNewSkeletonSkill },
            { provide: skills_tokens_1.SKILL_COUNTRY_PACK_VALIDATE, useExisting: country_pack_validate_skill_1.CountryPackValidateSkill },
            {
                provide: skills_tokens_1.SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
                useExisting: country_pack_generate_regression_tests_skill_1.CountryPackGenerateRegressionTestsSkill,
            },
            {
                provide: skills_tokens_1.SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
                useExisting: country_pack_suggest_improvements_skill_1.CountryPackSuggestImprovementsSkill,
            },
            { provide: skills_tokens_1.SKILL_COUNTRY_PACK_GET_BLOCKS, useExisting: country_pack_get_blocks_skill_1.CountryPackGetBlocksSkill },
            { provide: skills_tokens_1.SKILL_COUNTRY_PACK_RANK_BLOCKS, useExisting: country_pack_rank_blocks_skill_1.CountryPackRankBlocksSkill },
            route_pack_new_skeleton_skill_1.RoutePackNewSkeletonSkill,
            route_pack_validate_skill_1.RoutePackValidateSkill,
            route_pack_generate_regression_tests_skill_1.RoutePackGenerateRegressionTestsSkill,
            ...(enableContextEngineModule
                ? [
                    context_build_skill_1.ContextBuildSkill,
                    context_compress_skill_1.ContextCompressSkill,
                    context_evaluate_skill_1.ContextEvaluateSkill,
                    context_regression_tests_skill_1.ContextRegressionTestsSkill,
                    plan_select_slices_skill_1.PlanSelectSlicesSkill,
                    context_compile_package_skill_1.ContextCompilePackageSkill,
                ]
                : []),
            tools_select_skill_1.ToolsSelectSkill,
            ...(enableContextEngineModule
                ? [
                    { provide: skills_tokens_1.SKILL_CONTEXT_BUILD, useExisting: context_build_skill_1.ContextBuildSkill },
                    { provide: skills_tokens_1.SKILL_CONTEXT_COMPRESS, useExisting: context_compress_skill_1.ContextCompressSkill },
                    { provide: skills_tokens_1.SKILL_CONTEXT_EVALUATE, useExisting: context_evaluate_skill_1.ContextEvaluateSkill },
                    { provide: skills_tokens_1.SKILL_CONTEXT_REGRESSION_TESTS, useExisting: context_regression_tests_skill_1.ContextRegressionTestsSkill },
                    { provide: skills_tokens_1.SKILL_PLAN_SELECT_SLICES, useExisting: plan_select_slices_skill_1.PlanSelectSlicesSkill },
                ]
                : []),
            { provide: skills_tokens_1.SKILL_TOOLS_SELECT, useExisting: tools_select_skill_1.ToolsSelectSkill },
            ...(enableDecisionSkills
                ? [decision_log_append_skill_1.DecisionLogAppendSkill, decision_stage_skill_1.DecisionStageSkill, decision_replay_skill_1.DecisionReplaySkill]
                : []),
            ...(enableDecisionSkills
                ? [{ provide: skills_tokens_1.SKILL_DECISION_LOG_APPEND, useExisting: decision_log_append_skill_1.DecisionLogAppendSkill }]
                : []),
            skills_registry_service_1.SkillsRegistryService,
            skill_scanner_service_1.SkillScannerService,
            { provide: skills_registry_token_1.SKILLS_REGISTRY_TOKEN, useExisting: skills_registry_service_1.SkillsRegistryService },
            approval_storage_service_1.ApprovalStorageService,
            decision_request_approval_skill_1.DecisionRequestApprovalSkill,
            decision_check_approval_skill_1.DecisionCheckApprovalSkill,
            hitl_create_approval_task_skill_1.HitlCreateApprovalTaskSkill,
            hitl_resolve_approval_task_skill_1.HitlResolveApprovalTaskSkill,
            geo_find_nearby_poi_skill_1.GeoFindNearbyPOISkill,
            geo_sample_elevation_profile_skill_1.GeoSampleElevationProfileSkill,
            geo_find_candidate_within_corridor_skill_1.GeoFindCandidateWithinCorridorSkill,
            geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill,
            transport_search_skill_1.TransportSearchSkill,
            poi_search_skill_1.PoiSearchSkill,
            opening_hours_get_skill_1.OpeningHoursGetSkill,
            weather_search_skill_1.WeatherSearchSkill,
            web_browse_skill_1.WebBrowseSkill,
            itinerary_generate_skill_1.ItineraryGenerateSkill,
            itinerary_verify_skill_1.ItineraryVerifySkill,
            repair_apply_skill_1.RepairApplySkill,
            plan_architect_generate_skeleton_skill_1.PlanArchitectGenerateSkeletonSkill,
            plan_architect_compare_options_skill_1.PlanArchitectCompareOptionsSkill,
            plan_architect_commit_option_skill_1.PlanArchitectCommitOptionSkill,
            plan_budget_estimate_baseline_skill_1.PlanBudgetEstimateBaselineSkill,
            plan_budget_detect_overrun_skill_1.PlanBudgetDetectOverrunSkill,
            plan_budget_propose_tradeoffs_skill_1.PlanBudgetProposeTradeoffsSkill,
            plan_transit_build_transfer_graph_skill_1.PlanTransitBuildTransferGraphSkill,
            plan_transit_suggest_modes_skill_1.PlanTransitSuggestModesSkill,
            plan_transit_generate_plan_b_skill_1.PlanTransitGeneratePlanBSkill,
            plan_pace_compute_time_windows_skill_1.PlanPaceComputeTimeWindowsSkill,
            plan_pace_fatigue_score_skill_1.PlanPaceFatigueScoreSkill,
            plan_pace_adjust_schedule_skill_1.PlanPaceAdjustScheduleSkill,
            plan_gate_precheck_skill_1.PlanGatePrecheckSkill,
            plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
            plan_gate_propose_safe_alternatives_skill_1.PlanGateProposeSafeAlternativesSkill,
            plan_evidence_build_envelope_skill_1.PlanEvidenceBuildEnvelopeSkill,
            plan_constraints_detect_conflicts_skill_1.PlanConstraintsDetectConflictsSkill,
            plan_constraints_arbitrate_tradeoffs_skill_1.PlanConstraintsArbitrateTradeoffsSkill,
            plan_log_append_decision_skill_1.PlanLogAppendDecisionSkill,
            exec_remind_skill_1.ExecRemindSkill,
            exec_handle_change_skill_1.ExecHandleChangeSkill,
            exec_fallback_skill_1.ExecFallbackSkill,
            detail_understand_status_skill_1.DetailUnderstandStatusSkill,
            detail_analyze_health_skill_1.DetailAnalyzeHealthSkill,
            detail_explain_decision_skill_1.DetailExplainDecisionSkill,
            detail_show_evidence_skill_1.DetailShowEvidenceSkill,
        ],
        exports: [
            skills_registry_service_1.SkillsRegistryService,
            skills_registry_token_1.SKILLS_REGISTRY_TOKEN,
            ...(enableReadinessModule ? [dem_get_profile_skill_1.DemGetProfileSkill] : []),
            world_build_context_skill_1.WorldBuildContextSkill,
            world_realtime_weather_skill_1.WorldRealtimeWeatherSkill,
            world_weather_prediction_skill_1.WorldWeatherPredictionSkill,
            world_failure_risk_prediction_skill_1.WorldFailureRiskPredictionSkill,
            world_adaptive_parameters_skill_1.WorldAdaptiveParametersSkill,
            world_multimodal_perception_skill_1.WorldMultimodalPerceptionSkill,
            world_collaborative_data_skill_1.WorldCollaborativeDataSkill,
            ...(enableDecisionSkills
                ? [
                    decision_abu_check_skill_1.DecisionAbuCheckSkill,
                    decision_drdre_pace_skill_1.DecisionDrdrePaceSkill,
                    decision_neptune_repair_skill_1.DecisionNeptuneRepairSkill,
                    decision_run_three_guardians_skill_1.DecisionRunThreeGuardiansSkill,
                    decision_explain_for_human_skill_1.DecisionExplainForHumanSkill,
                ]
                : []),
            route_direction_pick_for_intent_skill_1.RouteDirectionPickForIntentSkill,
            route_direction_list_for_country_skill_1.RouteDirectionListForCountrySkill,
            ...(enableReadinessChecklistSkill && enableReadinessModule
                ? [readiness_generate_checklist_skill_1.ReadinessGenerateChecklistSkill, readiness_summarize_risks_skill_1.ReadinessSummarizeRisksSkill, readiness_check_visa_window_skill_1.ReadinessCheckVisaWindowSkill]
                : []),
            ...(enableTripsModule ? [trip_quick_evaluate_skill_1.TripQuickEvaluateSkill] : []),
            country_pack_new_skeleton_skill_1.CountryPackNewSkeletonSkill,
            country_pack_validate_skill_1.CountryPackValidateSkill,
            country_pack_generate_regression_tests_skill_1.CountryPackGenerateRegressionTestsSkill,
            country_pack_suggest_improvements_skill_1.CountryPackSuggestImprovementsSkill,
            country_pack_get_blocks_skill_1.CountryPackGetBlocksSkill,
            country_pack_rank_blocks_skill_1.CountryPackRankBlocksSkill,
            route_pack_new_skeleton_skill_1.RoutePackNewSkeletonSkill,
            route_pack_validate_skill_1.RoutePackValidateSkill,
            route_pack_generate_regression_tests_skill_1.RoutePackGenerateRegressionTestsSkill,
            ...(enableContextEngineModule
                ? [context_build_skill_1.ContextBuildSkill, context_compress_skill_1.ContextCompressSkill, context_evaluate_skill_1.ContextEvaluateSkill, context_regression_tests_skill_1.ContextRegressionTestsSkill, plan_select_slices_skill_1.PlanSelectSlicesSkill]
                : []),
            tools_select_skill_1.ToolsSelectSkill,
            ...(enableContextEngineModule
                ? [context_compile_package_skill_1.ContextCompilePackageSkill]
                : []),
            geo_find_nearby_poi_skill_1.GeoFindNearbyPOISkill,
            geo_sample_elevation_profile_skill_1.GeoSampleElevationProfileSkill,
            geo_find_candidate_within_corridor_skill_1.GeoFindCandidateWithinCorridorSkill,
            geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill,
            transport_search_skill_1.TransportSearchSkill,
            poi_search_skill_1.PoiSearchSkill,
            opening_hours_get_skill_1.OpeningHoursGetSkill,
            weather_search_skill_1.WeatherSearchSkill,
            web_browse_skill_1.WebBrowseSkill,
            itinerary_generate_skill_1.ItineraryGenerateSkill,
            itinerary_verify_skill_1.ItineraryVerifySkill,
            repair_apply_skill_1.RepairApplySkill,
            ...(enableDecisionSkills
                ? [decision_log_append_skill_1.DecisionLogAppendSkill, decision_stage_skill_1.DecisionStageSkill, decision_replay_skill_1.DecisionReplaySkill]
                : []),
            decision_request_approval_skill_1.DecisionRequestApprovalSkill,
            decision_check_approval_skill_1.DecisionCheckApprovalSkill,
            hitl_create_approval_task_skill_1.HitlCreateApprovalTaskSkill,
            hitl_resolve_approval_task_skill_1.HitlResolveApprovalTaskSkill,
            plan_architect_generate_skeleton_skill_1.PlanArchitectGenerateSkeletonSkill,
            plan_architect_compare_options_skill_1.PlanArchitectCompareOptionsSkill,
            plan_architect_commit_option_skill_1.PlanArchitectCommitOptionSkill,
            plan_budget_estimate_baseline_skill_1.PlanBudgetEstimateBaselineSkill,
            plan_budget_detect_overrun_skill_1.PlanBudgetDetectOverrunSkill,
            plan_budget_propose_tradeoffs_skill_1.PlanBudgetProposeTradeoffsSkill,
            plan_transit_build_transfer_graph_skill_1.PlanTransitBuildTransferGraphSkill,
            plan_transit_suggest_modes_skill_1.PlanTransitSuggestModesSkill,
            plan_transit_generate_plan_b_skill_1.PlanTransitGeneratePlanBSkill,
            plan_pace_compute_time_windows_skill_1.PlanPaceComputeTimeWindowsSkill,
            plan_pace_fatigue_score_skill_1.PlanPaceFatigueScoreSkill,
            plan_pace_adjust_schedule_skill_1.PlanPaceAdjustScheduleSkill,
            plan_gate_precheck_skill_1.PlanGatePrecheckSkill,
            plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
            plan_gate_propose_safe_alternatives_skill_1.PlanGateProposeSafeAlternativesSkill,
            plan_evidence_build_envelope_skill_1.PlanEvidenceBuildEnvelopeSkill,
            plan_constraints_detect_conflicts_skill_1.PlanConstraintsDetectConflictsSkill,
            plan_constraints_arbitrate_tradeoffs_skill_1.PlanConstraintsArbitrateTradeoffsSkill,
            plan_log_append_decision_skill_1.PlanLogAppendDecisionSkill,
            exec_remind_skill_1.ExecRemindSkill,
            exec_handle_change_skill_1.ExecHandleChangeSkill,
            exec_fallback_skill_1.ExecFallbackSkill,
            detail_understand_status_skill_1.DetailUnderstandStatusSkill,
            detail_analyze_health_skill_1.DetailAnalyzeHealthSkill,
            detail_explain_decision_skill_1.DetailExplainDecisionSkill,
            detail_show_evidence_skill_1.DetailShowEvidenceSkill,
        ],
    }),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __param(10, (0, common_1.Optional)()),
    __param(11, (0, common_1.Optional)()),
    __param(12, (0, common_1.Optional)()),
    __param(13, (0, common_1.Optional)()),
    __param(14, (0, common_1.Optional)()),
    __param(15, (0, common_1.Optional)()),
    __param(16, (0, common_1.Optional)()),
    __param(17, (0, common_1.Optional)()),
    __param(18, (0, common_1.Optional)()),
    __param(19, (0, common_1.Optional)()),
    __param(20, (0, common_1.Optional)()),
    __param(21, (0, common_1.Optional)()),
    __param(22, (0, common_1.Optional)()),
    __param(23, (0, common_1.Optional)()),
    __param(24, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [skill_scanner_service_1.SkillScannerService,
        skills_registry_service_1.SkillsRegistryService,
        decision_stage_skill_1.DecisionStageSkill,
        decision_replay_skill_1.DecisionReplaySkill,
        context_compile_package_skill_1.ContextCompilePackageSkill,
        geo_find_nearby_poi_skill_1.GeoFindNearbyPOISkill,
        geo_sample_elevation_profile_skill_1.GeoSampleElevationProfileSkill,
        geo_find_candidate_within_corridor_skill_1.GeoFindCandidateWithinCorridorSkill,
        geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill,
        transport_search_skill_1.TransportSearchSkill,
        poi_search_skill_1.PoiSearchSkill,
        opening_hours_get_skill_1.OpeningHoursGetSkill,
        weather_search_skill_1.WeatherSearchSkill,
        web_browse_skill_1.WebBrowseSkill,
        itinerary_generate_skill_1.ItineraryGenerateSkill,
        itinerary_verify_skill_1.ItineraryVerifySkill,
        repair_apply_skill_1.RepairApplySkill,
        route_pack_new_skeleton_skill_1.RoutePackNewSkeletonSkill,
        route_pack_validate_skill_1.RoutePackValidateSkill,
        route_pack_generate_regression_tests_skill_1.RoutePackGenerateRegressionTestsSkill,
        hitl_create_approval_task_skill_1.HitlCreateApprovalTaskSkill,
        hitl_resolve_approval_task_skill_1.HitlResolveApprovalTaskSkill,
        plan_gate_run_three_guardians_skill_1.PlanGateRunThreeGuardiansSkill,
        plan_gate_precheck_skill_1.PlanGatePrecheckSkill,
        plan_gate_propose_safe_alternatives_skill_1.PlanGateProposeSafeAlternativesSkill])
], SkillsModule);
//# sourceMappingURL=skills.module.js.map