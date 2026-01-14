// src/itinerary-optimization/itinerary-optimization.module.ts
import { Module } from '@nestjs/common';
import { ItineraryOptimizationController } from './itinerary-optimization.controller';
import { RouteOptimizationService } from './itinerary-optimization.service';
import { SpatialClusteringService } from './services/spatial-clustering.service';
import { HappinessScorerService } from './services/happiness-scorer.service';
import { RouteOptimizerService } from './services/route-optimizer.service';
import { VRPTWOptimizerService } from './services/vrptw-optimizer.service';
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
import { PrismaModule } from '../prisma/prisma.module';
import { TransportModule } from '../transport/transport.module';

@Module({
  imports: [
    PrismaModule,
    TransportModule, // 导入 TransportModule 以使用 RouteCacheService 和 SmartRoutesService
  ],
  controllers: [ItineraryOptimizationController],
  providers: [
    RouteOptimizationService,
    SpatialClusteringService,
    HappinessScorerService,
    RouteOptimizerService,
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
  ],
})
export class ItineraryOptimizationModule {}

