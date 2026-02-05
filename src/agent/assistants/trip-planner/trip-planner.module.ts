// src/agent/assistants/trip-planner/trip-planner.module.ts

import { Module, forwardRef } from '@nestjs/common';
// TripPlannerController 已删除（功能合并到 planning-assistant）
import { TripPlannerService } from './services/trip-planner.service';
import { ContextAnalyzerService } from './services/context-analyzer.service';
import { IntentDisambiguatorService } from './services/intent-disambiguator.service';
import { RouteOptimizationService } from './services/route-optimization.service';
import { TripPlannerFeedbackService } from './services/trip-planner-feedback.service';
import { PromptService } from './services/prompt.service';
import { GapPreferencesService } from './services/gap-preferences.service';
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
    forwardRef(() => RagModule), // 导入 RagModule 以使用 RAG 服务（LLM 失败时的降级策略），使用 forwardRef 避免循环依赖（RagModule -> SkillsModule -> AgentModule -> AssistantsModule -> TripPlannerModule）
    // 引入 AgentModule 获取 StateStore, Orchestrator, Sub-Agents
    forwardRef(() => AgentModule),
  ],
  controllers: [], // TripPlannerController 已删除，兼容性控制器也已删除
  providers: [
    TripPlannerService,
    ContextAnalyzerService,
    IntentDisambiguatorService,
    RouteOptimizationService,
    TripPlannerFeedbackService, // 🚀 Phase 3 优化：反馈服务
    PromptService, // 🚀 Prompt优化：Prompt版本管理服务
    GapPreferencesService, // 🚀 Phase 3 优化：缺口偏好服务
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
    TripPlannerFeedbackService, // 🚀 Phase 3 优化：导出反馈服务
  ],
})
export class TripPlannerModule {}
