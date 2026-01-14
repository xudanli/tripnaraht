// src/trips/decision/decision.module.ts

/**
 * Decision Module
 * 
 * 决策层模块：整合 Abu、Dr.Dre、Neptune 三个策略
 */

import { Module, forwardRef } from '@nestjs/common';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';
import { CandidatePoolService } from './candidates/candidate-pool.service';
import { TravelReliabilityService } from './travel/reliability.service';
import { EventTriggerService } from './events/event-trigger.service';
import { EvaluationService } from './evaluation/evaluation.service';
import { E2EReplayService } from './evaluation/e2e-replay.service';
import { E2ECaseStorageService } from './evaluation/e2e-case-storage.service';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
import { VersionService } from './versioning/version.service';
import { ExplainabilityService } from './explainability/explainability.service';
import { LearningService } from './learning/learning.service';
import { AdvancedConstraintsService } from './constraints/advanced-constraints.service';
import { ConstraintChecker } from './constraints/constraint-checker';
import { RouteDirectionConstraintsService } from './constraints/route-direction-constraints.service';
import { DecisionCacheService } from './performance/cache.service';
import { BatchProcessingService } from './performance/batch.service';
import { MonitoringService } from './monitoring/monitoring.service';
import { DecisionController } from './decision.controller';
import { DecisionStatsController } from './decision-stats.controller';
import { TransportModule } from '../../transport/transport.module';
// 在 MCP 模式下使用轻量级 PlacesLiteModule，避免启动卡死
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';

// 动态导入，避免在 MCP 模式下加载完整的 PlacesModule
let PlacesModuleOrLite: any;
if (isMcpMode && process.env.ENABLE_FULL_PLACES_MODULE !== 'true') {
  PlacesModuleOrLite = require('../../places/places-lite.module').PlacesLiteModule;
} else {
  PlacesModuleOrLite = require('../../places/places.module').PlacesModule;
}

import { RouteDirectionsModule } from '../../route-directions/route-directions.module';
import { MemoryModule } from '../../agent/memory/memory.module';
import { LlmModule } from '../../llm/llm.module';
import { ContextEngineModule } from '../../agent/context-engine/context-engine.module';
import { SkillsModule } from '../../skills/skills.module';
import { DemModule } from '../dem/dem.module';

// 使用 forwardRef 来解决循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
// 注意：DecisionModule 现在主要通过 DemModule 获取 DEM 服务，而不是直接依赖 ReadinessModule
// 暂时禁用 ReadinessModule 导入，使用懒加载获取 ReadinessService
// import { ReadinessModule } from '../readiness/readiness.module';
// 默认禁用 RouteDirectionsModule（避免启动阻塞），除非明确设置 ENABLE_ROUTE_DIRECTIONS_MODULE=true
const enableRouteDirectionsModule = process.env.ENABLE_ROUTE_DIRECTIONS_MODULE === 'true';
// ContextEngineModule 默认禁用，如需启用设置 ENABLE_CONTEXT_ENGINE_MODULE=true
const enableContextEngineModule = process.env.ENABLE_CONTEXT_ENGINE_MODULE === 'true';
// SkillsModule 默认禁用（测试是否导致阻塞）
const enableSkillsModule = process.env.ENABLE_SKILLS_MODULE === 'true';
// import { PoiFeaturesAdapterService } from './services/poi-features-adapter.service';
import { DEMDailyEnergyService } from './services/dem-daily-energy.service';
import { DEMRouteSegmentationService } from './services/dem-route-segmentation.service';
import { DEMRiskScoringService } from './services/dem-risk-scoring.service';
import { DEMEvidenceChainService } from './services/dem-evidence-chain.service';
import { DryRunPlannerService } from './services/dry-run-planner.service';
import { DemDecisionEvidencePipelineService } from './services/dem-decision-evidence-pipeline.service';
import { DemEvidenceEnforcerService } from './services/dem-evidence-enforcer.service';
import { DemDecisionEvidenceService } from './services/dem-decision-evidence.service';
import { WeatherDecisionEvidenceService } from './services/weather-decision-evidence.service';
import { PersonaExplanationService } from './services/persona-explanation.service';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { SpatialReplacementService } from './services/spatial-replacement.service';
import { SpatialIssueDetectorService } from './services/spatial-issue-detector.service';
import { FatigueCalculatorService } from './services/fatigue-calculator.service';
import { AbuStrategy } from './strategies/abu-strategy.service';
import { DrDreStrategy } from './strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from './strategies/neptune-strategy.service';
import { PlanConverterService } from './services/plan-converter.service';
import { DecisionStatsService } from './services/decision-stats.service';
import { HeuristicDietService } from './services/heuristic-diet.service';
import { TripFeedbackService } from './services/trip-feedback.service';
import { DecisionLogStorageService } from './services/decision-log-storage.service';
import { TripNaraCoreToolService } from './tools/tripnara-core-tool.service';
import { GraphDataConverterService } from './graph-db/graph-data-converter.service';
import { PlannerAgentService } from './orchestration/planner-agent.service';
import { NarratorAgentService } from './orchestration/narrator-agent.service';
import { LangGraphOrchestratorService } from './orchestration/langgraph-orchestrator.service';
import { ReadinessAgentService } from './readiness/readiness-agent.service';
import { ApprovalService } from './services/approval.service';
import { AgentResumeService } from './services/agent-resume.service';
import { ApprovalController } from './controllers/approval.controller';
import { ApprovalCleanupScheduler } from './schedulers/approval-cleanup.scheduler';

@Module({
  imports: [
    TransportModule, // 必需：SenseToolsAdapter 需要 SmartRoutesService
    DemModule, // 恢复：DemModule 不是问题
    // forwardRef(() => ReadinessModule), // 暂时禁用，使用懒加载获取 ReadinessService（打破循环依赖）
    // PlacesModuleOrLite, // 暂时禁用，检查依赖错误和依赖链
    ...(enableRouteDirectionsModule ? [RouteDirectionsModule] : []),
    // MemoryModule, // 暂时禁用，测试是否导致阻塞
    // LlmModule, // 暂时禁用，测试是否导致阻塞
    ...(enableContextEngineModule ? [ContextEngineModule] : []),
    ...(enableSkillsModule ? [forwardRef(() => SkillsModule)] : []),
  ], // 使用 forwardRef 避免与 ReadinessModule 和 SkillsModule 的循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
  controllers: [
    // 二分法：暂时禁用 DecisionController（测试是否是 StrategyOrchestratorService 导致阻塞）
    // DecisionController, // 需要 StrategyOrchestratorService
    // 二分法：暂时禁用 DecisionStatsController 和 ApprovalController（它们需要已禁用的服务）
    // DecisionStatsController, // 需要 DecisionStatsService, HeuristicDietService, DecisionLogClusteringService
    // ApprovalController, // 需要 ApprovalService, AgentResumeService
  ],
  providers: [
    TripDecisionEngineService,
    SenseToolsAdapter,
    // 二分法：暂时禁用最后2个服务，测试是否导致阻塞
    // CandidatePoolService,
    // TravelReliabilityService,
    // 二分法：暂时禁用前半部分的前半的前半的后半 providers，测试是否导致阻塞
    // EventTriggerService,
    // EvaluationService,
    // VersionService,
    // ExplainabilityService,
    // 二分法：暂时禁用前半部分的前半的后半 providers，测试是否导致阻塞
    // LearningService,
    // AdvancedConstraintsService,
    // ConstraintChecker,
    // RouteDirectionConstraintsService,
    // DecisionCacheService,
    // BatchProcessingService,
    // MonitoringService,
    // PoiFeaturesAdapterService,
    // 二分法：暂时禁用前半部分的后半 providers，测试是否导致阻塞
    // DEMDailyEnergyService,
    // DEMRouteSegmentationService,
    // DEMRiskScoringService,
    // DEMEvidenceChainService,
    // DryRunPlannerService,
    // 二分法：暂时禁用 TripNaraCoreToolService 及其依赖链，测试是否导致阻塞
    // 但需要恢复策略服务，因为 SkillsModule 的 Decision Skills 需要它们
    // DemDecisionEvidencePipelineService, // 暂时禁用：TripNaraCoreToolService 需要它
    // DemEvidenceEnforcerService,
    // DemDecisionEvidenceService,
    // WeatherDecisionEvidenceService,
    // PersonaExplanationService,
    StrategyOrchestratorService, // 恢复：DecisionRunThreeGuardiansSkill 需要它（所有依赖都已提供，应该不会导致阻塞）
    SpatialReplacementService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    SpatialIssueDetectorService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    FatigueCalculatorService, // 必需：DrDreStrategy 需要它（DecisionDrdrePaceSkill 需要 DrDreStrategy）
    AbuStrategy, // 必需：DecisionAbuCheckSkill 需要它
    DrDreStrategy, // 必需：DecisionDrdrePaceSkill 需要它
    NeptuneStrategy, // 必需：DecisionNeptuneRepairSkill 需要它
    // PlanConverterService,
    // 二分法：暂时禁用后半部分非必需服务，测试是否导致阻塞
    // DecisionStatsService,
    // HeuristicDietService,
    // TripFeedbackService,
    DecisionLogStorageService, // 必需：TripsService 需要它
    // E2ECaseStorageService,
    // E2EReplayService,
    // DecisionLogClusteringService,
    // TripNaraCoreToolService,
    // GraphDataConverterService,
    // PlannerAgentService, // 已测试，不是问题
    // NarratorAgentService, // 已测试，不是问题
    // LangGraphOrchestratorService, // 已测试，不是问题
    ReadinessAgentService, // 必需：SkillsModule 需要它
    // ApprovalService,
    // AgentResumeService,
    // ApprovalCleanupScheduler,
  ],
  exports: [
    TripDecisionEngineService,
    // 二分法：暂时禁用最后2个服务，测试是否导致阻塞
    // CandidatePoolService,
    // TravelReliabilityService,
    // 二分法：暂时禁用前半部分的前半的前半的后半 providers，测试是否导致阻塞
    // EventTriggerService,
    // EvaluationService,
    // VersionService,
    // ExplainabilityService,
    // 二分法：暂时禁用前半部分的前半的后半 providers，测试是否导致阻塞
    // LearningService,
    // AdvancedConstraintsService,
    // ConstraintChecker,
    // RouteDirectionConstraintsService,
    // DecisionCacheService,
    // BatchProcessingService,
    // MonitoringService,
    // PoiFeaturesAdapterService,
    // 二分法：暂时禁用前半部分的后半 providers，测试是否导致阻塞
    // DEMDailyEnergyService,
    // DEMRouteSegmentationService,
    // DEMRiskScoringService,
    // DEMEvidenceChainService,
    // DryRunPlannerService,
    // 二分法：暂时禁用 TripNaraCoreToolService 及其依赖链，测试是否导致阻塞
    // 但需要恢复策略服务，因为 SkillsModule 的 Decision Skills 需要它们
    // DemDecisionEvidencePipelineService, // 暂时禁用：TripNaraCoreToolService 需要它
    // DemEvidenceEnforcerService,
    // DemDecisionEvidenceService,
    // WeatherDecisionEvidenceService,
    // PersonaExplanationService,
    StrategyOrchestratorService, // 恢复：让 SkillsModule 可以注入（DecisionRunThreeGuardiansSkill 需要它）
    SpatialReplacementService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    SpatialIssueDetectorService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    FatigueCalculatorService, // 必需：DrDreStrategy 需要它（DecisionDrdrePaceSkill 需要 DrDreStrategy）
    AbuStrategy, // 必需：DecisionAbuCheckSkill 需要它
    DrDreStrategy, // 必需：DecisionDrdrePaceSkill 需要它
    NeptuneStrategy, // 必需：DecisionNeptuneRepairSkill 需要它
    // PlanConverterService,
    // 二分法：暂时禁用后半部分非必需服务，测试是否导致阻塞
    // DecisionStatsService,
    // HeuristicDietService,
    // TripFeedbackService,
    DecisionLogStorageService, // 必需：TripsService 需要它
    // E2ECaseStorageService,
    // E2EReplayService,
    // DecisionLogClusteringService,
    // TripNaraCoreToolService,
    // GraphDataConverterService,
    // PlannerAgentService, // 已测试，不是问题
    // NarratorAgentService, // 已测试，不是问题
    // LangGraphOrchestratorService, // 已测试，不是问题
    ReadinessAgentService, // 必需：SkillsModule 需要它
    // ApprovalService,
    // AgentResumeService,
  ],
})
export class DecisionModule {}

