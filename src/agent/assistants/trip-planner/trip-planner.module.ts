// src/agent/assistants/trip-planner/trip-planner.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { TripPlannerController } from './trip-planner.controller';
import { TripPlannerService } from './services/trip-planner.service';
import { ContextAnalyzerService } from './services/context-analyzer.service';
import { IntentDisambiguatorService } from './services/intent-disambiguator.service';
import { RouteOptimizationService } from './services/route-optimization.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LlmModule } from '../../../llm/llm.module';
import { DemModule } from '../../../trips/dem/dem.module';
import { AgentModule } from '../../agent.module';
import { RagModule } from '../../../rag/rag.module';
import { ItineraryVerifySkill } from '../../../skills/itinerary/itinerary-verify.skill';
import { TransportSearchSkill } from '../../../skills/transport/transport-search.skill';
import { OpeningHoursGetSkill } from '../../../skills/places/opening-hours-get.skill';
import { DemGetProfileSkill } from '../../../skills/dem/dem-get-profile.skill';
import { GeoCheckHazardZonesSkill } from '../../../skills/geo/geo-check-hazard-zones.skill';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    DemModule, // 导入 DemModule 以使用 DEM 服务（DemGetProfileSkill 需要 DEMElevationService 和 DEMEffortMetadataService）
    RagModule, // 导入 RagModule 以使用 RAG 服务（LLM 失败时的降级策略）
    // 引入 AgentModule 获取 StateStore, Orchestrator, Sub-Agents
    forwardRef(() => AgentModule),
  ],
  controllers: [TripPlannerController],
  providers: [
    TripPlannerService,
    ContextAnalyzerService,
    IntentDisambiguatorService,
    RouteOptimizationService,
    // Skills
    ItineraryVerifySkill,
    TransportSearchSkill,
    OpeningHoursGetSkill,
    DemGetProfileSkill,
    GeoCheckHazardZonesSkill,
  ],
  exports: [
    TripPlannerService,
    ContextAnalyzerService,
    IntentDisambiguatorService,
    RouteOptimizationService,
  ],
})
export class TripPlannerModule {}
