// src/itinerary-optimization/itinerary-optimization.module.ts
import { Module } from '@nestjs/common';
import { ItineraryOptimizationController } from './itinerary-optimization.controller';
import { RouteOptimizationService } from './itinerary-optimization.service';
import { SpatialClusteringService } from './services/spatial-clustering.service';
import { HappinessScorerService } from './services/happiness-scorer.service';
import { RouteOptimizerService } from './services/route-optimizer.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
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

