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
import { GeoFactsService } from './services/geo-facts.service';

@Module({
  imports: [PrismaModule],
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
    GeoFactsService,
  ],
  exports: [
    ReadinessService,
    PackStorageService,
    PackValidatorService,
    GeoFactsRiverService,
    GeoFactsMountainService,
    GeoFactsRoadService,
    GeoFactsCoastlineService,
    GeoFactsService,
  ],
})
export class ReadinessModule {}

