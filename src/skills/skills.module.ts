// src/skills/skills.module.ts
/**
 * Skills Module
 * 
 * 统一管理所有 Skills
 */

import { Module, OnModuleInit, forwardRef, Logger, Optional } from '@nestjs/common';
import { DecisionModule } from '../trips/decision/decision.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';
import { TripsModule } from '../trips/trips.module';
import { ContextEngineModule } from '../agent/context-engine/context-engine.module';
import { PlacesModule } from '../places/places.module';
import { PlacesEmbeddingModule } from '../places/places-embedding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DemModule } from '../trips/dem/dem.module';

// DEM Skills
import { DemGetProfileSkill } from './dem/dem-get-profile.skill';

// Decision Skills
import { DecisionAbuCheckSkill } from './decision/decision-abu-check.skill';
import { DecisionDrdrePaceSkill } from './decision/decision-drdre-pace.skill';
import { DecisionNeptuneRepairSkill } from './decision/decision-neptune-repair.skill';

// RouteDirection Skills
import { RouteDirectionPickForIntentSkill } from './route-direction/route-direction-pick-for-intent.skill';
import { RouteDirectionListForCountrySkill } from './route-direction/route-direction-list-for-country.skill';

// Readiness Skills
import { ReadinessGenerateChecklistSkill } from './readiness/readiness-generate-checklist.skill';
import { ReadinessSummarizeRisksSkill } from './readiness/readiness-summarize-risks.skill';
import { ReadinessCheckVisaWindowSkill } from './readiness/readiness-check-visa-window.skill';

// Trip Skills
import { TripQuickEvaluateSkill } from './trip/trip-quick-evaluate.skill';

// World Skills
import { WorldBuildContextSkill } from './world/world-build-context.skill';

// Decision Skills (additional)
import { DecisionRunThreeGuardiansSkill } from './decision/decision-run-three-guardians.skill';
import { DecisionExplainForHumanSkill } from './decision/decision-explain-for-human.skill';

// CountryPack Skills
import { CountryPackNewSkeletonSkill } from './country-pack/country-pack-new-skeleton.skill';
import { CountryPackValidateSkill } from './country-pack/country-pack-validate.skill';
import { CountryPackGenerateRegressionTestsSkill } from './country-pack/country-pack-generate-regression-tests.skill';
import { CountryPackSuggestImprovementsSkill } from './country-pack/country-pack-suggest-improvements.skill';
import { CountryPackGetBlocksSkill } from './country-pack/country-pack-get-blocks.skill';
import { CountryPackRankBlocksSkill } from './country-pack/country-pack-rank-blocks.skill';

// RoutePack Skills
import { RoutePackNewSkeletonSkill } from './route-pack/route-pack-new-skeleton.skill';
import { RoutePackValidateSkill } from './route-pack/route-pack-validate.skill';
import { RoutePackGenerateRegressionTestsSkill } from './route-pack/route-pack-generate-regression-tests.skill';

// Context Skills
import { ContextBuildSkill } from './context/context-build.skill';
import { ContextCompressSkill } from './context/context-compress.skill';
import { ContextEvaluateSkill } from './context/context-evaluate.skill';
import { ContextRegressionTestsSkill } from './context/context-regression-tests.skill';
import { PlanSelectSlicesSkill } from './context/plan-select-slices.skill';
import { ToolsSelectSkill } from './context/tools-select.skill';
import { ContextCompilePackageSkill } from './context/context-compile-package.skill';

// Geo Skills
import { GeoFindNearbyPOISkill } from './geo/geo-find-nearby-poi.skill';
import { GeoSampleElevationProfileSkill } from './geo/geo-sample-elevation-profile.skill';
import { GeoFindCandidateWithinCorridorSkill } from './geo/geo-find-candidate-within-corridor.skill';
import { GeoCheckHazardZonesSkill } from './geo/geo-check-hazard-zones.skill';

// Decision Skills (additional)
import { DecisionLogAppendSkill } from './decision/decision-log-append.skill';
import { DecisionStageSkill } from './decision/decision-stage.skill';
import { DecisionReplaySkill } from './decision/decision-replay.skill';

// Skills Registry Service
import { SkillsRegistryService } from './services/skills-registry.service';
import { SkillScannerService } from './services/skill-scanner.service';
import { SKILLS_REGISTRY_TOKEN } from './services/skills-registry.token';

// HITL Skills
import { DecisionRequestApprovalSkill } from './hitl/decision-request-approval.skill';
import { DecisionCheckApprovalSkill } from './hitl/decision-check-approval.skill';
import { HitlCreateApprovalTaskSkill } from './hitl/hitl-create-approval-task.skill';
import { HitlResolveApprovalTaskSkill } from './hitl/hitl-resolve-approval-task.skill';
import { ApprovalStorageService } from './hitl/services/approval-storage.service';
import {
  SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
  SKILL_COUNTRY_PACK_NEW_SKELETON,
  SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
  SKILL_COUNTRY_PACK_VALIDATE,
  SKILL_COUNTRY_PACK_GET_BLOCKS,
  SKILL_COUNTRY_PACK_RANK_BLOCKS,
  SKILL_CONTEXT_BUILD,
  SKILL_CONTEXT_COMPRESS,
  SKILL_PLAN_SELECT_SLICES,
  SKILL_TOOLS_SELECT,
  SKILL_DECISION_LOG_APPEND,
  SKILL_CONTEXT_EVALUATE,
  SKILL_CONTEXT_REGRESSION_TESTS,
  SKILL_READINESS_CHECK_VISA_WINDOW,
  SKILL_TRIP_QUICK_EVALUATE,
  SKILL_DECISION_ABU_CHECK,
  SKILL_DECISION_DRDRE_PACE,
  SKILL_DECISION_NEPTUNE_REPAIR,
  SKILL_DECISION_RUN_THREE_GUARDIANS,
  SKILL_DECISION_EXPLAIN_FOR_HUMAN,
  SKILL_DEM_GET_PROFILE,
  SKILL_READINESS_GENERATE_CHECKLIST,
  SKILL_READINESS_SUMMARIZE_RISKS,
  SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT,
  SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY,
  SKILL_WORLD_BUILD_CONTEXT,
} from './skills.tokens';

// DecisionModule 在 MCP 模式下已修复（使用 PlacesLiteModule）
// 默认禁用 DecisionModule 导入以避免循环依赖问题
// 如需启用，设置 ENABLE_DECISION_SKILLS=true
const enableDecisionSkills = process.env.ENABLE_DECISION_SKILLS === 'true';
// readiness.generateChecklist 目前依赖 DecisionModule（ReadinessAgentService 在 decision 模块内）
const enableReadinessChecklistSkill = enableDecisionSkills;
// MCP 模式下默认禁用 ReadinessModule 和 TripsModule（避免启动阻塞）
const enableReadinessModule = process.env.ENABLE_READINESS_MODULE === 'true';
const enableTripsModule = process.env.ENABLE_TRIPS_MODULE === 'true';
// PlacesModule 在 MCP 模式下默认禁用（导致启动阻塞）
// PlacesEmbeddingModule 在 MCP 模式下默认启用（只提供 EmbeddingService，不阻塞启动）
const enablePlacesEmbeddingModule = process.env.ENABLE_PLACES_EMBEDDING_MODULE !== 'false';
// ContextEngineModule 在 MCP 模式下默认启用（核心功能）
// 临时禁用 ContextEngineModule 以测试是否是循环依赖导致的阻塞
// 注意：与 McpAppModule 保持一致，默认启用（!== 'false'）
const enableContextEngineModule = process.env.ENABLE_CONTEXT_ENGINE_MODULE !== 'false';
const enablePlacesModule = process.env.ENABLE_PLACES_MODULE === 'true';

@Module({
  imports: [
    // 先导入 PlacesEmbeddingModule，确保 EmbeddingService 在 ToolsSelectSkill 之前可用
    ...(enablePlacesEmbeddingModule ? [PlacesEmbeddingModule] : []), // 只提供 EmbeddingService（用于 Tool RAG Embedding），默认启用，不阻塞启动
    ...(enablePlacesModule ? [PlacesModule] : []), // 完整的 PlacesModule（包含所有服务），默认禁用（导致启动阻塞）
    // DEM 模块（独立模块，不形成循环依赖）
    DemModule, // 导入 DemModule 以使用 DEM 服务（DemGetProfileSkill 需要）
    // 其他模块
    ...(enableDecisionSkills ? [forwardRef(() => DecisionModule)] : []), // 使用 forwardRef 避免与 DecisionModule 的循环依赖
    // 默认禁用 RouteDirectionsModule（避免启动阻塞），除非明确设置 ENABLE_ROUTE_DIRECTIONS_MODULE=true
    ...(process.env.ENABLE_ROUTE_DIRECTIONS_MODULE === 'true' ? [RouteDirectionsModule] : []),
    ...(enableReadinessModule ? [forwardRef(() => ReadinessModule)] : []), // 使用 forwardRef 避免与 ReadinessModule 的循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> SkillsModule -> ReadinessModule）
    ...(enableTripsModule ? [forwardRef(() => TripsModule)] : []), // 使用 forwardRef 避免与 TripsModule 的循环依赖（TripsModule -> DecisionModule -> SkillsModule -> TripsModule）
    ...(enableContextEngineModule ? [forwardRef(() => ContextEngineModule)] : []), // 使用 forwardRef 避免循环依赖，默认启用
    PrismaModule, // 导入 PrismaModule 以支持 ApprovalStorageService 使用数据库
  ],
  providers: [
    // DEM Skills（依赖 ReadinessModule）
    ...(enableReadinessModule
      ? [
          DemGetProfileSkill,
          { provide: SKILL_DEM_GET_PROFILE, useExisting: DemGetProfileSkill },
        ]
      : []),
    
    // World Skills
    WorldBuildContextSkill,
    { provide: SKILL_WORLD_BUILD_CONTEXT, useExisting: WorldBuildContextSkill },
    
    // Decision Skills
    ...(enableDecisionSkills
      ? [
          DecisionAbuCheckSkill,
          DecisionDrdrePaceSkill,
          DecisionNeptuneRepairSkill,
          DecisionRunThreeGuardiansSkill,
          DecisionExplainForHumanSkill,
        ]
      : []),
    ...(enableDecisionSkills
      ? [
          { provide: SKILL_DECISION_ABU_CHECK, useExisting: DecisionAbuCheckSkill },
          { provide: SKILL_DECISION_DRDRE_PACE, useExisting: DecisionDrdrePaceSkill },
          { provide: SKILL_DECISION_NEPTUNE_REPAIR, useExisting: DecisionNeptuneRepairSkill },
          { provide: SKILL_DECISION_RUN_THREE_GUARDIANS, useExisting: DecisionRunThreeGuardiansSkill },
          { provide: SKILL_DECISION_EXPLAIN_FOR_HUMAN, useExisting: DecisionExplainForHumanSkill },
        ]
      : []),
    
    // RouteDirection Skills
    RouteDirectionPickForIntentSkill,
    RouteDirectionListForCountrySkill,
    { provide: SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT, useExisting: RouteDirectionPickForIntentSkill },
    { provide: SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY, useExisting: RouteDirectionListForCountrySkill },
    
    // Readiness Skills（依赖 ReadinessModule 和 DecisionModule）
    ...(enableReadinessChecklistSkill && enableReadinessModule
      ? [ReadinessGenerateChecklistSkill, ReadinessSummarizeRisksSkill, ReadinessCheckVisaWindowSkill]
      : []),
    ...(enableReadinessChecklistSkill && enableReadinessModule
      ? [
          { provide: SKILL_READINESS_GENERATE_CHECKLIST, useExisting: ReadinessGenerateChecklistSkill },
          { provide: SKILL_READINESS_SUMMARIZE_RISKS, useExisting: ReadinessSummarizeRisksSkill },
          { provide: SKILL_READINESS_CHECK_VISA_WINDOW, useExisting: ReadinessCheckVisaWindowSkill },
        ]
      : []),
    
    // Trip Skills（依赖 TripsModule）
    ...(enableTripsModule
      ? [
          TripQuickEvaluateSkill,
          { provide: SKILL_TRIP_QUICK_EVALUATE, useExisting: TripQuickEvaluateSkill },
        ]
      : []),
    
    // CountryPack Skills
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    CountryPackSuggestImprovementsSkill,
    CountryPackGetBlocksSkill,
    CountryPackRankBlocksSkill,
    { provide: SKILL_COUNTRY_PACK_NEW_SKELETON, useExisting: CountryPackNewSkeletonSkill },
    { provide: SKILL_COUNTRY_PACK_VALIDATE, useExisting: CountryPackValidateSkill },
    {
      provide: SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS,
      useExisting: CountryPackGenerateRegressionTestsSkill,
    },
    {
      provide: SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS,
      useExisting: CountryPackSuggestImprovementsSkill,
    },
    { provide: SKILL_COUNTRY_PACK_GET_BLOCKS, useExisting: CountryPackGetBlocksSkill },
    { provide: SKILL_COUNTRY_PACK_RANK_BLOCKS, useExisting: CountryPackRankBlocksSkill },
    
    // RoutePack Skills
    RoutePackNewSkeletonSkill,
    RoutePackValidateSkill,
    RoutePackGenerateRegressionTestsSkill,
    
    // Context Skills（依赖 ContextEngineModule，默认启用）
    ...(enableContextEngineModule
      ? [
          ContextBuildSkill,
          ContextCompressSkill,
          ContextEvaluateSkill,
          ContextRegressionTestsSkill,
          PlanSelectSlicesSkill,
          ContextCompilePackageSkill,
        ]
      : []),
    ToolsSelectSkill, // ToolsSelectSkill 不依赖 ContextEngineModule，只依赖 EmbeddingService（可选）
    ...(enableContextEngineModule
      ? [
          { provide: SKILL_CONTEXT_BUILD, useExisting: ContextBuildSkill },
          { provide: SKILL_CONTEXT_COMPRESS, useExisting: ContextCompressSkill },
          { provide: SKILL_CONTEXT_EVALUATE, useExisting: ContextEvaluateSkill },
          { provide: SKILL_CONTEXT_REGRESSION_TESTS, useExisting: ContextRegressionTestsSkill },
          { provide: SKILL_PLAN_SELECT_SLICES, useExisting: PlanSelectSlicesSkill },
        ]
      : []),
    { provide: SKILL_TOOLS_SELECT, useExisting: ToolsSelectSkill },
    
    // Decision Skills (additional)
    ...(enableDecisionSkills
      ? [DecisionLogAppendSkill, DecisionStageSkill, DecisionReplaySkill]
      : []),
    ...(enableDecisionSkills
      ? [{ provide: SKILL_DECISION_LOG_APPEND, useExisting: DecisionLogAppendSkill }]
      : []),
    
    // Registry
    SkillsRegistryService,
    SkillScannerService,
    { provide: SKILLS_REGISTRY_TOKEN, useExisting: SkillsRegistryService },
    
    // HITL Skills (使用 @Skill() 装饰器自动注册)
    ApprovalStorageService,
    DecisionRequestApprovalSkill,
    DecisionCheckApprovalSkill,
    HitlCreateApprovalTaskSkill,
    HitlResolveApprovalTaskSkill,
    
    // Geo Skills
    GeoFindNearbyPOISkill,
    GeoSampleElevationProfileSkill,
    GeoFindCandidateWithinCorridorSkill,
    GeoCheckHazardZonesSkill,
  ],
  exports: [
    SkillsRegistryService,
    SKILLS_REGISTRY_TOKEN,
    ...(enableReadinessModule ? [DemGetProfileSkill] : []),
    WorldBuildContextSkill,
    ...(enableDecisionSkills
      ? [
          DecisionAbuCheckSkill,
          DecisionDrdrePaceSkill,
          DecisionNeptuneRepairSkill,
          DecisionRunThreeGuardiansSkill,
          DecisionExplainForHumanSkill,
        ]
      : []),
    RouteDirectionPickForIntentSkill,
    RouteDirectionListForCountrySkill,
    ...(enableReadinessChecklistSkill && enableReadinessModule
      ? [ReadinessGenerateChecklistSkill, ReadinessSummarizeRisksSkill, ReadinessCheckVisaWindowSkill]
      : []),
    ...(enableTripsModule ? [TripQuickEvaluateSkill] : []),
    CountryPackNewSkeletonSkill,
    CountryPackValidateSkill,
    CountryPackGenerateRegressionTestsSkill,
    CountryPackSuggestImprovementsSkill,
    CountryPackGetBlocksSkill,
    CountryPackRankBlocksSkill,
    // RoutePack Skills
    RoutePackNewSkeletonSkill,
    RoutePackValidateSkill,
    RoutePackGenerateRegressionTestsSkill,
    ...(enableContextEngineModule
      ? [ContextBuildSkill, ContextCompressSkill, ContextEvaluateSkill, ContextRegressionTestsSkill, PlanSelectSlicesSkill]
      : []),
    ToolsSelectSkill,
    ...(enableContextEngineModule
      ? [ContextCompilePackageSkill]
      : []),
    
    // Geo Skills
    GeoFindNearbyPOISkill,
    GeoSampleElevationProfileSkill,
    GeoFindCandidateWithinCorridorSkill,
    GeoCheckHazardZonesSkill,
    ...(enableDecisionSkills
      ? [DecisionLogAppendSkill, DecisionStageSkill, DecisionReplaySkill]
      : []),
    DecisionRequestApprovalSkill,
    DecisionCheckApprovalSkill,
    HitlCreateApprovalTaskSkill,
    HitlResolveApprovalTaskSkill,
  ],
})
// 临时注释掉 OnModuleInit，以测试是否是 onModuleInit 导致的阻塞
// export class SkillsModule implements OnModuleInit {
export class SkillsModule {
  private readonly logger = new Logger(SkillsModule.name);

  /**
   * 在模块初始化时自动扫描并注册所有带有 @Skill() 装饰器的类
   */
  constructor(
    private readonly skillScanner: SkillScannerService,
    private readonly skillsRegistry: SkillsRegistryService,
    @Optional() private readonly decisionStageSkill?: DecisionStageSkill,
    @Optional() private readonly decisionReplaySkill?: DecisionReplaySkill,
    @Optional() private readonly contextCompilePackageSkill?: ContextCompilePackageSkill,
    @Optional() private readonly geoFindNearbyPOISkill?: GeoFindNearbyPOISkill,
    @Optional() private readonly geoSampleElevationProfileSkill?: GeoSampleElevationProfileSkill,
    @Optional() private readonly geoFindCandidateWithinCorridorSkill?: GeoFindCandidateWithinCorridorSkill,
    @Optional() private readonly geoCheckHazardZonesSkill?: GeoCheckHazardZonesSkill,
    @Optional() private readonly routePackNewSkeletonSkill?: RoutePackNewSkeletonSkill,
    @Optional() private readonly routePackValidateSkill?: RoutePackValidateSkill,
    @Optional() private readonly routePackGenerateRegressionTestsSkill?: RoutePackGenerateRegressionTestsSkill,
    @Optional() private readonly hitlCreateApprovalTaskSkill?: HitlCreateApprovalTaskSkill,
    @Optional() private readonly hitlResolveApprovalTaskSkill?: HitlResolveApprovalTaskSkill,
  ) {
    this.logger.log('[SkillsModule] 构造函数开始执行...');
    
    // 手动注册新 Decision Skills（没有 token 的）
    if (this.decisionStageSkill) {
      this.skillsRegistry.registerSkill(this.decisionStageSkill);
      this.logger.debug('Registered DecisionStageSkill');
    }
    if (this.decisionReplaySkill) {
      this.skillsRegistry.registerSkill(this.decisionReplaySkill);
      this.logger.debug('Registered DecisionReplaySkill');
    }
    
    // 手动注册新 Context Skills（没有 token 的）
    if (this.contextCompilePackageSkill) {
      this.skillsRegistry.registerSkill(this.contextCompilePackageSkill);
      this.logger.debug('Registered ContextCompilePackageSkill');
    }
    
    // 手动注册新 Geo Skills（没有 token 的）
    if (this.geoFindNearbyPOISkill) {
      this.skillsRegistry.registerSkill(this.geoFindNearbyPOISkill);
      this.logger.debug('Registered GeoFindNearbyPOISkill');
    }
    if (this.geoSampleElevationProfileSkill) {
      this.skillsRegistry.registerSkill(this.geoSampleElevationProfileSkill);
      this.logger.debug('Registered GeoSampleElevationProfileSkill');
    }
    if (this.geoFindCandidateWithinCorridorSkill) {
      this.skillsRegistry.registerSkill(this.geoFindCandidateWithinCorridorSkill);
      this.logger.debug('Registered GeoFindCandidateWithinCorridorSkill');
    }
    if (this.geoCheckHazardZonesSkill) {
      this.skillsRegistry.registerSkill(this.geoCheckHazardZonesSkill);
      this.logger.debug('Registered GeoCheckHazardZonesSkill');
    }
    
    // 手动注册新 RoutePack Skills（没有 token 的）
    if (this.routePackNewSkeletonSkill) {
      this.skillsRegistry.registerSkill(this.routePackNewSkeletonSkill);
      this.logger.debug('Registered RoutePackNewSkeletonSkill');
    }
    if (this.routePackValidateSkill) {
      this.skillsRegistry.registerSkill(this.routePackValidateSkill);
      this.logger.debug('Registered RoutePackValidateSkill');
    }
    if (this.routePackGenerateRegressionTestsSkill) {
      this.skillsRegistry.registerSkill(this.routePackGenerateRegressionTestsSkill);
      this.logger.debug('Registered RoutePackGenerateRegressionTestsSkill');
    }
    
    // 手动注册新 HITL Skills（没有 token 的）
    if (this.hitlCreateApprovalTaskSkill) {
      this.skillsRegistry.registerSkill(this.hitlCreateApprovalTaskSkill);
      this.logger.debug('Registered HitlCreateApprovalTaskSkill');
    }
    if (this.hitlResolveApprovalTaskSkill) {
      this.skillsRegistry.registerSkill(this.hitlResolveApprovalTaskSkill);
      this.logger.debug('Registered HitlResolveApprovalTaskSkill');
    }

    // 临时在构造函数中执行扫描（延迟到下一个 tick，确保依赖已初始化）
    // TODO: 如果应用上下文能成功创建，说明问题确实在 onModuleInit
    const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                      process.env.MCP_MODE === 'true';
    
    if (isMcpMode && process.env.ENABLE_SKILL_SCAN_IN_CONSTRUCTOR === 'true') {
      // 使用 setImmediate 延迟执行，确保所有依赖都已注入
      setImmediate(() => {
        this.logger.log('[SkillsModule] 在构造函数中执行 Skill 扫描（延迟）...');
        // 这里暂时不执行扫描，只是记录日志
      });
    }
    this.logger.log('[SkillsModule] 构造函数执行完成');
  }

  /**
   * 在模块初始化后执行自动扫描
   * 
   * 注意：由于 NestJS 的初始化顺序，我们通过 OnModuleInit 生命周期钩子来执行扫描
   * 
   * 已禁用：避免启动阻塞，Skills 可以在运行时通过装饰器自动注册
   */
  async _onModuleInit_DISABLED() {
    // 检查是否在 MCP 模式下
    const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                      process.env.MCP_MODE === 'true';
    
    // 临时禁用 onModuleInit 中的扫描逻辑，以测试是否是扫描导致的阻塞
    if (isMcpMode && process.env.DISABLE_SKILL_SCAN === 'true') {
      this.logger.log('[SkillsModule] Skill 扫描已禁用（DISABLE_SKILL_SCAN=true），直接返回');
      return;
    }
    
    try {
      // 收集所有 Skill 类（包括使用 @Skill() 装饰器的）
      const skillClasses = [
        // 使用 @Skill() 装饰器的类会自动注册
        DecisionRequestApprovalSkill,
        DecisionCheckApprovalSkill,
        // 其他手动注册的 Skill 类可以保留（向后兼容）
      ];
      
      this.logger.log(`[SkillsModule] 准备扫描 ${skillClasses.length} 个 Skill 类...`);
      
      // 在 MCP 模式下，使用更短的超时时间
      const timeoutMs = isMcpMode ? 2000 : 5000;
      
      // 添加超时保护，避免无限等待
      const scanPromise = this.skillScanner.scanAndRegisterSkills(skillClasses);
      const timeoutPromise = new Promise<void>((_, reject) => 
        setTimeout(() => {
          this.logger.warn(`[SkillsModule] scanAndRegisterSkills 超时（${timeoutMs}ms），继续启动...`);
          reject(new Error(`scanAndRegisterSkills timeout after ${timeoutMs}ms`));
        }, timeoutMs)
      );
      
      try {
        await Promise.race([scanPromise, timeoutPromise]);
        this.logger.log('[SkillsModule] onModuleInit() 扫描完成');
      } catch (timeoutError: any) {
        if (timeoutError.message.includes('timeout')) {
          this.logger.warn('[SkillsModule] 扫描超时，但继续启动（Skills 可以在运行时注册）');
        } else {
          this.logger.error(`[SkillsModule] 扫描失败: ${timeoutError.message}`);
          // 不重新抛出，继续启动
        }
      }
    } catch (error: any) {
      this.logger.error(`[SkillsModule] onModuleInit() 执行失败: ${error.message}`, error.stack);
      // 不抛出错误，避免阻止应用启动
      // 在 MCP 模式下，即使扫描失败，也应该继续启动
    }
    
    this.logger.log('[SkillsModule] onModuleInit() 方法结束（无论成功或失败）');
  }
}

