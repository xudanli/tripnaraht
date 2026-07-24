// src/trips/readiness/readiness.module.ts

/**
 * Readiness Module
 * 
 * 准备度检查模块
 */

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OptimizationModule } from '../decision/optimization/optimization.module';
import { PoiAccessCapacityModule } from '../../poi-access-capacity/poi-access-capacity.module';
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
import { PhysicalRealityRetrievalService } from './services/physical-reality-retrieval.service';
import { PhysicalRealityQualityMonitorService } from './services/physical-reality-quality-monitor.service';
import { PhysicalRealityDEMAssociationService } from './services/physical-reality-dem-association.service';
import { CapabilityPackEvaluatorService } from './services/capability-pack-evaluator.service';
import { ReadinessController } from './readiness.controller';
import { DemModule } from '../dem/dem.module';
import { UsersModule } from '../../users/users.module';
import { ChecklistStatusService } from './services/checklist-status.service';
import { FindingMarksService } from './services/finding-marks.service';
import { PackingListService } from './services/packing-list.service';
import { PackingTemplateService } from './services/packing-template.service';
import { SolutionService } from './services/solution.service';
import { ReadinessAIService } from './services/readiness-ai.service';
import { ReadinessCacheService } from './services/readiness-cache.service';
import { ReadinessFeatureFlagsService } from './services/readiness-feature-flags.service';
import { CapabilityPackChecklistService } from './services/capability-pack-checklist.service';
import { CoverageMapService } from './services/coverage-map.service';
import { ReadinessAutoRepairService } from './services/readiness-auto-repair.service';
import { ReadinessRepairService } from './services/readiness-repair.service';
import { ReadinessGuardianNegotiationService } from './services/readiness-guardian-negotiation.service';
import { ReadinessDecisionRepairBridgeService } from './services/readiness-decision-repair-bridge.service';
import { TripPlanPersistenceService } from './services/trip-plan-persistence.service';
import { RiskTypeMapperService } from './services/risk-type-mapper.service';
import { TripReadinessWeatherForecastService } from './services/trip-readiness-weather-forecast.service';
import { ReadinessCausalPreanalysisService } from './services/readiness-causal-preanalysis.service';
import { TripDependencyImpactService } from './services/trip-dependency-impact.service';
import { UserDecisionService } from './services/user-decision.service';
import { LlmModule } from '../../llm/llm.module';
import { RedisModule } from '../../redis/redis.module';
import { RagModule } from '../../rag/rag.module';
import { TransportModule } from '../../transport/transport.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { TripPrerequisitesModule } from '../prerequisites/trip-prerequisites.module';
// 使用 forwardRef 来解决循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
// 暂时禁用，验证懒加载方案是否能解决问题
// import { TripsModule } from '../trips.module';

@Module({
  imports: [
    PrismaModule, 
    UsersModule,
    DemModule, // 导入 DemModule 以使用 DEM 服务
    LlmModule, // 导入 LlmModule 以使用 LLM 服务
    RedisModule, // 导入 RedisModule 以使用 Redis 服务
    forwardRef(() => RagModule), // 使用 forwardRef 避免循环依赖（ReadinessModule -> RagModule -> SkillsModule -> ReadinessModule）
    forwardRef(() => OptimizationModule),
    forwardRef(() => PoiAccessCapacityModule),
    TripPrerequisitesModule,
    TransportModule,
    EffectivePlanExecutionModule,
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
    PhysicalRealityRetrievalService,
    PhysicalRealityQualityMonitorService,
    PhysicalRealityDEMAssociationService,
    CapabilityPackEvaluatorService,
    // DEMElevationService 和 DEMEffortMetadataService 已移至 DemModule
    ChecklistStatusService,
    FindingMarksService,
    PackingListService,
    PackingTemplateService,
    SolutionService,
    // AI 增强服务
    ReadinessAIService,
    ReadinessCacheService,
    ReadinessFeatureFlagsService,
    // 能力包清单服务
    CapabilityPackChecklistService,
    // 覆盖地图服务
    CoverageMapService,
    ReadinessAutoRepairService,
    ReadinessRepairService,
    ReadinessDecisionRepairBridgeService,
    TripPlanPersistenceService,
    ReadinessGuardianNegotiationService,
    // 风险类型映射服务
    RiskTypeMapperService,
    // 行程天气预报（Open-Meteo）
    TripReadinessWeatherForecastService,
    ReadinessCausalPreanalysisService,
    TripDependencyImpactService,
    // 用户决策服务
    UserDecisionService,
  ],
  exports: [
    ReadinessService,
    CoverageMapService,
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
    PhysicalRealityRetrievalService,
    PhysicalRealityQualityMonitorService,
    PhysicalRealityDEMAssociationService,
    CapabilityPackEvaluatorService,
    // DEMElevationService 和 DEMEffortMetadataService 已移至 DemModule
    // AI 增强服务
    ReadinessAIService,
    ReadinessCacheService,
    ReadinessFeatureFlagsService,
    CoverageMapService,
    ReadinessRepairService,
    ReadinessGuardianNegotiationService,
    ReadinessCausalPreanalysisService,
    // 用户决策服务
    UserDecisionService,
  ],
})
export class ReadinessModule {}
