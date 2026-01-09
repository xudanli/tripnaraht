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
import { ReadinessModule } from '../readiness/readiness.module';
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
  imports: [TransportModule, forwardRef(() => ReadinessModule), PlacesModuleOrLite, RouteDirectionsModule, MemoryModule, LlmModule, ContextEngineModule, forwardRef(() => SkillsModule)], // 使用 forwardRef 避免与 ReadinessModule 和 SkillsModule 的循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
  controllers: [DecisionController, DecisionStatsController, ApprovalController],
  providers: [
    TripDecisionEngineService,
    SenseToolsAdapter,
    CandidatePoolService,
    TravelReliabilityService,
    EventTriggerService,
    EvaluationService,
    VersionService,
    ExplainabilityService,
    LearningService,
    AdvancedConstraintsService,
    ConstraintChecker,
    RouteDirectionConstraintsService,
    DecisionCacheService,
    BatchProcessingService,
    MonitoringService,
    // PoiFeaturesAdapterService,
    DEMDailyEnergyService,
    DEMRouteSegmentationService,
    DEMRiskScoringService,
    DEMEvidenceChainService,
    DryRunPlannerService,
    DemDecisionEvidencePipelineService,
    DemEvidenceEnforcerService,
    DemDecisionEvidenceService,
    WeatherDecisionEvidenceService,
    PersonaExplanationService,
    StrategyOrchestratorService,
    SpatialReplacementService,
    SpatialIssueDetectorService,
    FatigueCalculatorService,
    AbuStrategy,
    DrDreStrategy,
    NeptuneStrategy,
    PlanConverterService,
    DecisionStatsService,
    HeuristicDietService,
    TripFeedbackService,
    DecisionLogStorageService,
    E2ECaseStorageService,
    E2EReplayService,
    DecisionLogClusteringService,
    TripNaraCoreToolService,
    GraphDataConverterService,
    PlannerAgentService,
    NarratorAgentService,
    LangGraphOrchestratorService,
    ReadinessAgentService,
    ApprovalService,
    AgentResumeService,
    ApprovalCleanupScheduler,
  ],
  exports: [
    TripDecisionEngineService,
    CandidatePoolService,
    TravelReliabilityService,
    EventTriggerService,
    EvaluationService,
    VersionService,
    ExplainabilityService,
    LearningService,
    AdvancedConstraintsService,
    ConstraintChecker,
    RouteDirectionConstraintsService,
    DecisionCacheService,
    BatchProcessingService,
    MonitoringService,
    // PoiFeaturesAdapterService,
    DEMDailyEnergyService,
    DEMRouteSegmentationService,
    DEMRiskScoringService,
    DEMEvidenceChainService,
    DryRunPlannerService,
    DemDecisionEvidencePipelineService,
    DemEvidenceEnforcerService,
    DemDecisionEvidenceService,
    WeatherDecisionEvidenceService,
    PersonaExplanationService,
    StrategyOrchestratorService,
    SpatialReplacementService,
    SpatialIssueDetectorService,
    FatigueCalculatorService,
    AbuStrategy,
    DrDreStrategy,
    NeptuneStrategy,
    PlanConverterService,
    DecisionStatsService,
    HeuristicDietService,
    TripFeedbackService,
    E2ECaseStorageService,
    DecisionLogStorageService,
    E2EReplayService,
    DecisionLogClusteringService,
    TripNaraCoreToolService,
    GraphDataConverterService,
    PlannerAgentService,
    NarratorAgentService,
    LangGraphOrchestratorService,
    ReadinessAgentService,
    ApprovalService,
    AgentResumeService,
  ],
})
export class DecisionModule {}

