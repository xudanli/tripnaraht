"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItineraryOptimizationModule = void 0;
const common_1 = require("@nestjs/common");
const itinerary_optimization_service_1 = require("./itinerary-optimization.service");
const spatial_clustering_service_1 = require("./services/spatial-clustering.service");
const happiness_scorer_service_1 = require("./services/happiness-scorer.service");
const route_optimizer_service_1 = require("./services/route-optimizer.service");
const vrptw_optimizer_service_1 = require("./services/vrptw-optimizer.service");
const enhanced_vrptw_optimizer_service_1 = require("./services/enhanced-vrptw-optimizer.service");
const robust_time_matrix_service_1 = require("./services/robust-time-matrix.service");
const explanation_service_1 = require("./services/explanation.service");
const data_expiry_policy_service_1 = require("./services/data-expiry-policy.service");
const conservative_strategy_service_1 = require("./services/conservative-strategy.service");
const metrics_aggregator_service_1 = require("./services/metrics-aggregator.service");
const multi_strategy_route_generator_service_1 = require("./services/multi-strategy-route-generator.service");
const product_explainable_output_builder_service_1 = require("./services/product-explainable-output-builder.service");
const alternative_comparison_service_1 = require("./services/alternative-comparison.service");
const scenario_optimization_service_1 = require("./services/scenario-optimization.service");
const queue_time_model_service_1 = require("./services/queue-time-model.service");
const dynamic_transport_time_service_1 = require("./services/dynamic-transport-time.service");
const enhanced_rest_time_service_1 = require("./services/enhanced-rest-time.service");
const prisma_module_1 = require("../prisma/prisma.module");
const transport_module_1 = require("../transport/transport.module");
let ItineraryOptimizationModule = class ItineraryOptimizationModule {
};
exports.ItineraryOptimizationModule = ItineraryOptimizationModule;
exports.ItineraryOptimizationModule = ItineraryOptimizationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            transport_module_1.TransportModule,
        ],
        providers: [
            itinerary_optimization_service_1.RouteOptimizationService,
            spatial_clustering_service_1.SpatialClusteringService,
            happiness_scorer_service_1.HappinessScorerService,
            route_optimizer_service_1.RouteOptimizerService,
            vrptw_optimizer_service_1.VRPTWOptimizerService,
            enhanced_vrptw_optimizer_service_1.EnhancedVRPTWOptimizerService,
            robust_time_matrix_service_1.RobustTimeMatrixService,
            explanation_service_1.ExplanationService,
            data_expiry_policy_service_1.DataExpiryPolicyService,
            conservative_strategy_service_1.ConservativeStrategyService,
            metrics_aggregator_service_1.MetricsAggregatorService,
            multi_strategy_route_generator_service_1.MultiStrategyRouteGeneratorService,
            product_explainable_output_builder_service_1.ProductExplainableOutputBuilderService,
            alternative_comparison_service_1.AlternativeComparisonService,
            scenario_optimization_service_1.ScenarioOptimizationService,
            queue_time_model_service_1.QueueTimeModelService,
            dynamic_transport_time_service_1.DynamicTransportTimeService,
            enhanced_rest_time_service_1.EnhancedRestTimeService,
        ],
        exports: [
            itinerary_optimization_service_1.RouteOptimizationService,
            enhanced_vrptw_optimizer_service_1.EnhancedVRPTWOptimizerService,
            vrptw_optimizer_service_1.VRPTWOptimizerService,
            robust_time_matrix_service_1.RobustTimeMatrixService,
            explanation_service_1.ExplanationService,
            data_expiry_policy_service_1.DataExpiryPolicyService,
            conservative_strategy_service_1.ConservativeStrategyService,
            metrics_aggregator_service_1.MetricsAggregatorService,
            multi_strategy_route_generator_service_1.MultiStrategyRouteGeneratorService,
            product_explainable_output_builder_service_1.ProductExplainableOutputBuilderService,
            alternative_comparison_service_1.AlternativeComparisonService,
            scenario_optimization_service_1.ScenarioOptimizationService,
            queue_time_model_service_1.QueueTimeModelService,
            dynamic_transport_time_service_1.DynamicTransportTimeService,
            enhanced_rest_time_service_1.EnhancedRestTimeService,
        ],
    })
], ItineraryOptimizationModule);
//# sourceMappingURL=itinerary-optimization.module.js.map