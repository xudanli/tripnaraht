// src/itinerary-optimization/itinerary-optimization.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ItineraryOptimizationController } from './itinerary-optimization.controller';
import { RouteOptimizationService } from './itinerary-optimization.service';
import { SpatialClusteringService } from './services/spatial-clustering.service';
import { HappinessScorerService } from './services/happiness-scorer.service';
import { RouteOptimizerService } from './services/route-optimizer.service';
import { VRPTWOptimizerService } from './services/vrptw-optimizer.service';
import { OrToolsTspService } from './services/or-tools-tsp.service';
import { EnhancedVRPTWOptimizerService } from './services/enhanced-vrptw-optimizer.service';
import { RobustTimeMatrixService } from './services/robust-time-matrix.service';
import { ExplanationService } from './services/explanation.service';
import { DataExpiryPolicyService } from './services/data-expiry-policy.service';
import { ConservativeStrategyService } from './services/conservative-strategy.service';
import { MetricsAggregatorService } from './services/metrics-aggregator.service';
import { MultiStrategyRouteGeneratorService } from './services/multi-strategy-route-generator.service';
import { ProductExplainableOutputBuilderService } from './services/product-explainable-output-builder.service';
import { AlternativeComparisonService } from './services/alternative-comparison.service';
import { ScenarioOptimizationService } from './services/scenario-optimization.service';
import { QueueTimeModelService } from './services/queue-time-model.service';
import { DynamicTransportTimeService } from './services/dynamic-transport-time.service';
import { EnhancedRestTimeService } from './services/enhanced-rest-time.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportModule } from '../transport/transport.module';
import { TripsModule } from '../trips/trips.module';

/**
 * 行程优化模块
 */
@Module({
  controllers: [ItineraryOptimizationController],
  imports: [
    PrismaModule,
    TransportModule, // 导入 TransportModule 以使用 RouteCacheService 和 SmartRoutesService
    forwardRef(() => TripsModule), // 使用 forwardRef 避免循环依赖（ItineraryOptimizationModule -> TripsModule -> AgentModule -> ItineraryOptimizationModule）
  ],
  providers: [
    RouteOptimizationService,
    SpatialClusteringService,
    HappinessScorerService,
    RouteOptimizerService,
    OrToolsTspService,
    VRPTWOptimizerService,
    EnhancedVRPTWOptimizerService,
    RobustTimeMatrixService,
    ExplanationService,
    DataExpiryPolicyService,
    ConservativeStrategyService,
    MetricsAggregatorService,
    MultiStrategyRouteGeneratorService,
    ProductExplainableOutputBuilderService,
    AlternativeComparisonService,
    ScenarioOptimizationService,
    QueueTimeModelService,
    DynamicTransportTimeService,
    EnhancedRestTimeService,
  ],
  exports: [
    RouteOptimizationService,
    EnhancedVRPTWOptimizerService,
    VRPTWOptimizerService,
    RobustTimeMatrixService,
    ExplanationService,
    DataExpiryPolicyService,
    ConservativeStrategyService,
    MetricsAggregatorService,
    MultiStrategyRouteGeneratorService,
    ProductExplainableOutputBuilderService,
    AlternativeComparisonService,
    ScenarioOptimizationService,
    QueueTimeModelService,
    DynamicTransportTimeService,
    EnhancedRestTimeService,
  ],
})
export class ItineraryOptimizationModule {}

