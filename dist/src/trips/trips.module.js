"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsModule = void 0;
const common_1 = require("@nestjs/common");
const trips_service_1 = require("./trips.service");
const trips_controller_1 = require("./trips.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const flight_price_service_1 = require("./services/flight-price.service");
const flight_price_detail_service_1 = require("./services/flight-price-detail.service");
const schedule_converter_service_1 = require("./services/schedule-converter.service");
const action_history_service_1 = require("./services/action-history.service");
const trip_extended_service_1 = require("./services/trip-extended.service");
const trip_recap_service_1 = require("./services/trip-recap.service");
const trip_emergency_service_1 = require("./services/trip-emergency.service");
const trip_budget_service_1 = require("./services/trip-budget.service");
const trip_adjustment_service_1 = require("./services/trip-adjustment.service");
const trip_draft_service_1 = require("./services/trip-draft.service");
const trip_metrics_service_1 = require("./services/trip-metrics.service");
const trip_conflicts_service_1 = require("./services/trip-conflicts.service");
const trip_intent_service_1 = require("./services/trip-intent.service");
const trip_optimization_service_1 = require("./services/trip-optimization.service");
const trip_suggestions_service_1 = require("./services/trip-suggestions.service");
const trip_insight_service_1 = require("./services/trip-insight.service");
const budget_evaluation_service_1 = require("./services/budget-evaluation.service");
const evidence_management_service_1 = require("./services/evidence-management.service");
const evidence_freshness_calculator_service_1 = require("./services/evidence-freshness-calculator.service");
const evidence_confidence_calculator_service_1 = require("./services/evidence-confidence-calculator.service");
const evidence_quality_scorer_service_1 = require("./services/evidence-quality-scorer.service");
const evidence_filtering_service_1 = require("./services/evidence-filtering.service");
const evidence_completeness_checker_service_1 = require("./services/evidence-completeness-checker.service");
const evidence_trigger_service_1 = require("./services/evidence-trigger.service");
const evidence_fetch_task_service_1 = require("./services/evidence-fetch-task.service");
const nl_conversation_context_service_1 = require("./services/nl-conversation-context.service");
const llm_module_1 = require("../llm/llm.module");
const decision_module_1 = require("./decision/decision.module");
const itinerary_items_module_1 = require("../itinerary-items/itinerary-items.module");
const auth_module_1 = require("../auth/auth.module");
const redis_module_1 = require("../redis/redis.module");
const context_engine_module_1 = require("../agent/context-engine/context-engine.module");
const skills_module_1 = require("../skills/skills.module");
const decision_draft_module_1 = require("../decision-draft/decision-draft.module");
const places_module_1 = require("../places/places.module");
const destination_clarification_module_1 = require("./nl-clarification/destination-clarification.module");
const booking_com_module_1 = require("../mcp/booking-com.module");
let TripsModule = class TripsModule {
};
exports.TripsModule = TripsModule;
exports.TripsModule = TripsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, llm_module_1.LlmModule, (0, common_1.forwardRef)(() => decision_module_1.DecisionModule), itinerary_items_module_1.ItineraryItemsModule, auth_module_1.AuthModule, redis_module_1.RedisModule, context_engine_module_1.ContextEngineModule, (0, common_1.forwardRef)(() => skills_module_1.SkillsModule), (0, common_1.forwardRef)(() => decision_draft_module_1.DecisionDraftModule), (0, common_1.forwardRef)(() => places_module_1.PlacesModule), destination_clarification_module_1.DestinationClarificationModule, booking_com_module_1.BookingComModule],
        controllers: [trips_controller_1.TripsController],
        providers: [
            trips_service_1.TripsService,
            flight_price_service_1.FlightPriceService,
            flight_price_detail_service_1.FlightPriceDetailService,
            schedule_converter_service_1.ScheduleConverterService,
            action_history_service_1.ActionHistoryService,
            trip_extended_service_1.TripExtendedService,
            trip_recap_service_1.TripRecapService,
            trip_emergency_service_1.TripEmergencyService,
            trip_budget_service_1.TripBudgetService,
            trip_adjustment_service_1.TripAdjustmentService,
            trip_draft_service_1.TripDraftService,
            trip_metrics_service_1.TripMetricsService,
            trip_conflicts_service_1.TripConflictsService,
            trip_intent_service_1.TripIntentService,
            trip_optimization_service_1.TripOptimizationService,
            trip_suggestions_service_1.TripSuggestionsService,
            trip_insight_service_1.TripInsightService,
            budget_evaluation_service_1.BudgetEvaluationService,
            evidence_management_service_1.EvidenceManagementService,
            evidence_freshness_calculator_service_1.EvidenceFreshnessCalculator,
            evidence_confidence_calculator_service_1.EvidenceConfidenceCalculator,
            evidence_quality_scorer_service_1.EvidenceQualityScorer,
            evidence_filtering_service_1.EvidenceFilteringService,
            evidence_completeness_checker_service_1.EvidenceCompletenessChecker,
            evidence_trigger_service_1.EvidenceTriggerService,
            evidence_fetch_task_service_1.EvidenceFetchTaskService,
            nl_conversation_context_service_1.NLConversationContextService,
        ],
        exports: [
            trips_service_1.TripsService,
            flight_price_service_1.FlightPriceService,
            flight_price_detail_service_1.FlightPriceDetailService,
            schedule_converter_service_1.ScheduleConverterService,
            action_history_service_1.ActionHistoryService,
            trip_extended_service_1.TripExtendedService,
            trip_recap_service_1.TripRecapService,
            trip_emergency_service_1.TripEmergencyService,
            trip_budget_service_1.TripBudgetService,
            trip_adjustment_service_1.TripAdjustmentService,
            trip_draft_service_1.TripDraftService,
            trip_metrics_service_1.TripMetricsService,
            trip_conflicts_service_1.TripConflictsService,
            trip_intent_service_1.TripIntentService,
            trip_optimization_service_1.TripOptimizationService,
            trip_suggestions_service_1.TripSuggestionsService,
            trip_insight_service_1.TripInsightService,
            budget_evaluation_service_1.BudgetEvaluationService,
            evidence_management_service_1.EvidenceManagementService,
            evidence_fetch_task_service_1.EvidenceFetchTaskService,
            nl_conversation_context_service_1.NLConversationContextService,
        ],
    })
], TripsModule);
//# sourceMappingURL=trips.module.js.map