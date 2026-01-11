// src/trips/readiness/readiness.module.ts

/**
 * Readiness Module
 * 
 * 准备度检查模块
 */

import { Module, forwardRef } from '@nestjs/common';
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
import { ReadinessController } from './readiness.controller';
import { DemModule } from '../dem/dem.module';
import { UsersModule } from '../../users/users.module';
import { ChecklistStatusService } from './services/checklist-status.service';
import { FindingMarksService } from './services/finding-marks.service';
import { PackingListService } from './services/packing-list.service';
import { SolutionService } from './services/solution.service';
// 使用 forwardRef 来解决循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
// 暂时禁用，验证懒加载方案是否能解决问题
// import { TripsModule } from '../trips.module';

@Module({
  imports: [
    PrismaModule, 
    UsersModule,
    DemModule, // 导入 DemModule 以使用 DEM 服务
    // forwardRef(() => TripsModule), // 暂时禁用，验证懒加载方案是否能解决问题
  ],
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
    // DEMElevationService 和 DEMEffortMetadataService 已移至 DemModule
    ChecklistStatusService,
    FindingMarksService,
    PackingListService,
    SolutionService,
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
    // DEMElevationService 和 DEMEffortMetadataService 已移至 DemModule
  ],
})
export class ReadinessModule {}

