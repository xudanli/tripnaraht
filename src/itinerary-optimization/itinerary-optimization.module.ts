// src/itinerary-optimization/itinerary-optimization.module.ts
import { Module } from '@nestjs/common';
import { ItineraryOptimizationController } from './itinerary-optimization.controller';
import { RouteOptimizationService } from './itinerary-optimization.service';
import { SpatialClusteringService } from './services/spatial-clustering.service';
import { HappinessScorerService } from './services/happiness-scorer.service';
import { RouteOptimizerService } from './services/route-optimizer.service';
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
  ],
  exports: [RouteOptimizationService],
})
export class ItineraryOptimizationModule {}

