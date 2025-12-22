// src/trips/readiness/readiness.module.ts

/**
 * Readiness Module
 * 
 * 准备度检查模块
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReadinessService } from './services/readiness.service';
import { ReadinessChecker } from './engine/readiness-checker';
import { FactsToReadinessCompiler } from './compilers/facts-to-readiness.compiler';
import { ReadinessToConstraintsCompiler } from './compilers/readiness-to-constraints.compiler';
import { PackStorageService } from './storage/pack-storage.service';
import { PackValidatorService } from './storage/pack-validator.service';
import { GeoFactsRiverService } from './services/geo-facts-river.service';
import { GeoFactsMountainService } from './services/geo-facts-mountain.service';
import { GeoFactsRoadService } from './services/geo-facts-road.service';
import { GeoFactsCoastlineService } from './services/geo-facts-coastline.service';
import { GeoFactsPortService } from './services/geo-facts-port.service';
import { GeoFactsAirlineService } from './services/geo-facts-airline.service';
import { GeoFactsPOIService } from './services/geo-facts-poi.service';
import { POIPickupScorerService } from './services/poi-pickup-scorer.service';
import { POITrailheadService } from './services/poi-trailhead.service';
import { GeoFactsService } from './services/geo-facts.service';
import { GeoFactsCacheService } from './services/geo-facts-cache.service';
import { CapabilityPackEvaluatorService } from './services/capability-pack-evaluator.service';
import { DEMElevationService } from './services/dem-elevation.service';
import { DEMEffortMetadataService } from './services/dem-effort-metadata.service';
import { ReadinessController } from './readiness.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReadinessController],
  providers: [
    ReadinessService,
    ReadinessChecker,
    FactsToReadinessCompiler,
    ReadinessToConstraintsCompiler,
    PackStorageService,
    PackValidatorService,
    GeoFactsRiverService,
    GeoFactsMountainService,
    GeoFactsRoadService,
    GeoFactsCoastlineService,
    GeoFactsPortService,
    GeoFactsAirlineService,
    POIPickupScorerService,
    POITrailheadService,
    GeoFactsPOIService,
    GeoFactsService,
    GeoFactsCacheService,
    CapabilityPackEvaluatorService,
    DEMElevationService,
    DEMEffortMetadataService,
  ],
  exports: [
    ReadinessService,
    PackStorageService,
    PackValidatorService,
    GeoFactsRiverService,
    GeoFactsMountainService,
    GeoFactsRoadService,
    GeoFactsCoastlineService,
    GeoFactsPortService,
    GeoFactsAirlineService,
    POIPickupScorerService,
    POITrailheadService,
    GeoFactsPOIService,
    GeoFactsService,
    GeoFactsCacheService,
    CapabilityPackEvaluatorService,
    DEMElevationService,
    DEMEffortMetadataService,
  ],
})
export class ReadinessModule {}

