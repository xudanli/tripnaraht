// src/trips/decision/decision.module.ts

/**
 * Decision Module
 * 
 * 决策层模块：整合 Abu、Dr.Dre、Neptune 三个策略
 */

import { Module, forwardRef } from '@nestjs/common';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
import { ExplainabilityService } from './explainability/explainability.service';
import { ConstraintChecker } from './constraints/constraint-checker';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { ConstraintDSLCompiler } from './constraints/constraint-dsl-compiler.service';
import { ConstraintConflictResolver } from './constraints/constraint-conflict-resolver.service';
import { RoadConstraintPropagationService } from './constraints/road-constraint-propagation.service';
import { IcelandRoadModule } from '../../iceland-road/iceland-road.module';
import { MultiPlanGenerator } from './services/multi-plan-generator.service';
import { FeedbackCollectorService } from './feedback/feedback-collector.service';
import { QualityAssessorService } from './feedback/quality-assessor.service';
import { MemoryUpdaterService } from './feedback/memory-updater.service';
import { DecisionController } from './decision.controller';
import { DecisionStatsController } from './decision-stats.controller';
import { DecisionEngineController } from './decision-engine.controller';
import { TransportModule } from '../../transport/transport.module';
// 在 MCP 模式下使用轻量级 PlacesLiteModule，避免启动卡死
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';

// 动态导入，避免在 MCP 模式下加载完整的 PlacesModule（@Module 中暂未启用）
let _placesModuleOrLite: any;
if (isMcpMode && process.env.ENABLE_FULL_PLACES_MODULE !== 'true') {
  _placesModuleOrLite = require('../../places/places-lite.module').PlacesLiteModule;
} else {
  _placesModuleOrLite = require('../../places/places.module').PlacesModule;
}

import { RouteDirectionsModule } from '../../route-directions/route-directions.module';
import { ContextEngineModule } from '../../agent/context-engine/context-engine.module';
import { SkillsModule } from '../../skills/skills.module';
import { DemModule } from '../dem/dem.module';
import { TrailsModule } from '../../trails/trails.module';
import { TrailPlanningAdapter } from './adapters/trail-planning.adapter';
import { HardTrekTripMetadataService } from '../../hiking-demo/services/hard-trek-trip-metadata.service';

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
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { PersonaClosureLoopService } from './services/persona-closure-loop.service';
import { SpatialReplacementService } from './services/spatial-replacement.service';
import { SpatialIssueDetectorService } from './services/spatial-issue-detector.service';
import { FatigueCalculatorService } from './services/fatigue-calculator.service';
import { DrivingSafetyConcernService } from './services/driving-safety-concern.service';
import { TdfpmCalculatorService } from './services/tdfpm-calculator.service';
import { WeatherDecisionEvidenceService } from './services/weather-decision-evidence.service';
import {
  DailyUtilityCalculatorService,
  UserProfileWeightsService,
} from './optimization/daily-utility';
import { ExpectedUtilityLogService } from './services/expected-utility-log.service';
import { PlanModificationLogService } from './services/plan-modification-log.service';
import { AbuStrategy } from './strategies/abu-strategy.service';
import { DrDreStrategy } from './strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from './strategies/neptune-strategy.service';
import { DecisionStatsService } from './services/decision-stats.service';
import { HeuristicDietService } from './services/heuristic-diet.service';
import { DecisionLogStorageService } from './services/decision-log-storage.service';
import { OpsRealityAuditService } from './services/ops-reality-audit.service';
import { OperationalPolicyService } from './operational-policy/operational-policy.service';
import { DecisionLoggingService } from './services/decision-logging.service';
import { ReadinessAgentService } from './readiness/readiness-agent.service';
import { ApprovalService } from './services/approval.service';
import { AgentResumeService } from './services/agent-resume.service';
import { ApprovalController } from './controllers/approval.controller';
import { FitnessAssessmentService } from './services/fitness-assessment.service';
import { FitnessAssessmentController } from './controllers/fitness-assessment.controller';
// Phase 2: 体能数据分析服务
import { FitnessAnalyticsService } from './services/fitness-analytics.service';
import { FitnessABTestingService } from './services/fitness-ab-testing.service';
import { CalibrationSchedulerService } from './services/calibration-scheduler.service';
import { WearableIntegrationService } from './services/wearable-integration.service';
import { FitnessAnalyticsController } from './controllers/fitness-analytics.controller';
import { DecisionStateManagerService } from './services/decision-state-manager.service';
import { EcoIdentityLedgerPersistenceService } from './services/eco-identity-ledger-persistence.service';
import { DsoLatestStateFromTripProvider } from './services/dso-latest-state-from-trip.provider';
import { DSO_LATEST_STATE_PROVIDER } from '../../decision/kernel/dso-latest-state-provider.interface';
import { PrismaModule } from '../../prisma/prisma.module';
import { ThreeLayerExplanationService } from './services/three-layer-explanation.service';
import { RhythmMatchingService } from './services/rhythm-matching.service';
import { MultiPersonDecisionService } from './services/multi-person-decision.service';
import { TrainingModule } from '../../agent/training/training.module';
import { ExaModule } from '../../mcp/exa.module';
import { AirbnbModule } from '../../mcp/airbnb.module';
import { BookingComModule } from '../../mcp/booking-com.module';

// Phase 1/2/3: 优化模块（目标函数、概率模型、多智能体协商）
import { OptimizationModule } from './optimization/optimization.module';

// Phase 2: 数据飞轮（Decision → Outcome → Parameter Update → Better Decision）
import { FlywheelModule } from './flywheel/flywheel.module';
import { DecisionFlywheelController } from './flywheel/decision-flywheel.controller';
import { InterventionEngine } from '../../decision/actuator/intervention-engine';
import { SharedMemoryModule } from '../../agent/memory/shared-memory.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

// 动态加载 DataQualityModule / DataModelingModule，避免 watch 模式下 resolve 失败导致启动崩溃
let DataQualityModule: any;
let DataModelingModule: any;
try {
  DataQualityModule = require('../../data-quality/data-quality.module').DataQualityModule;
} catch {
  DataQualityModule = null;
}
try {
  DataModelingModule = require('../../data-modeling/data-modeling.module').DataModelingModule;
} catch {
  DataModelingModule = null;
}

@Module({
  imports: [
    PrismaModule, // DsoLatestStateFromTripProvider 需要
    TransportModule, // 必需：SenseToolsAdapter 需要 SmartRoutesService
    DemModule, // 恢复：DemModule 不是问题
    TrailsModule, // Phase 2.5：硬徒步 Trail 段编排
    ...(DataQualityModule ? [forwardRef(() => DataQualityModule)] : []), // 数据质量模块（用于信息源标注）
    ...(DataModelingModule ? [DataModelingModule] : []), // 数据建模模块（用于不确定性建模）
    // forwardRef(() => ReadinessModule), // 暂时禁用，使用懒加载获取 ReadinessService（打破循环依赖）
    // _placesModuleOrLite, // 暂时禁用，检查依赖错误和依赖链
    ...(enableRouteDirectionsModule ? [forwardRef(() => RouteDirectionsModule)] : []),
    SharedMemoryModule,
    EventEmitterModule,
    // LlmModule, // 暂时禁用，测试是否导致阻塞
    ...(enableContextEngineModule ? [ContextEngineModule] : []),
    ...(enableSkillsModule ? [forwardRef(() => SkillsModule)] : []),
    TrainingModule, // Iterative Deployment 训练模块
    ExaModule, // Exa 集成模块（实时信息搜索）
    AirbnbModule, // Airbnb 集成模块（住宿搜索）
    BookingComModule, // Booking.com 集成模块（租车搜索）
    OptimizationModule, // Phase 1/2/3: 优化模块（目标函数、概率模型、多智能体协商）
    FlywheelModule, // Phase 2: 数据飞轮
    IcelandRoadModule, // 冰岛路网约束图 MVP → ROAD_CONSTRAINT_UPDATE / semantic delta
  ], // 使用 forwardRef 避免与 ReadinessModule 和 SkillsModule 的循环依赖（ReadinessModule -> TripsModule -> DecisionModule -> ReadinessModule）
  controllers: [
    DecisionController, // 恢复：决策控制器（Abu/Dr.Dre/Neptune 策略）
    DecisionEngineController, // 决策引擎统一 API：/api/decision-engine/v1/*
    DecisionStatsController, // 恢复：决策统计控制器
    ApprovalController, // 恢复：审批控制器
    FitnessAssessmentController, // Phase 1：体能评估控制器
    FitnessAnalyticsController, // Phase 2：体能数据分析控制器
    DecisionFlywheelController, // Phase 2+: Live preview + risk feedback gateway
  ],
  providers: [
    InterventionEngine,
    EcoIdentityLedgerPersistenceService,
    TrailPlanningAdapter,
    HardTrekTripMetadataService,
    TripDecisionEngineService,
    SenseToolsAdapter,
    // 二分法：暂时禁用最后2个服务，测试是否导致阻塞
    // CandidatePoolService,
    // TravelReliabilityService,
    // 二分法：暂时禁用前半部分的前半的前半的后半 providers，测试是否导致阻塞
    // EventTriggerService,
    // EvaluationService,
    // VersionService,
    ExplainabilityService, // 决策引擎 API explain-plan 需要
    // LearningService,
    // AdvancedConstraintsService,
    ConstraintChecker, // 恢复：约束检查器（集成冲突检测）
    ConstraintEngineService, // Phase 0：isFeasible 统一入口
    ConstraintDSLCompiler, // 新增：约束DSL编译器
    ConstraintConflictResolver, // 新增：约束冲突解析器
    RoadConstraintPropagationService, // 路网约束图传播 → SEMANTIC_DELTA
    MultiPlanGenerator, // 新增：多方案生成器
    FeedbackCollectorService, // P2：反馈收集服务
    QualityAssessorService, // P2：质量评估服务
    MemoryUpdaterService, // P2：记忆更新服务
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
    WeatherDecisionEvidenceService,
    // PersonaExplanationService,
    StrategyOrchestratorService, // 恢复：DecisionRunThreeGuardiansSkill 需要它（所有依赖都已提供，应该不会导致阻塞）
    PersonaClosureLoopService,
    SpatialReplacementService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    SpatialIssueDetectorService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    FatigueCalculatorService, // 必需：DrDreStrategy 需要它（DecisionDrdrePaceSkill 需要 DrDreStrategy）
    DrivingSafetyConcernService, // 驾驶安全关注点（驾驶进入危险区 → 三人格提醒）
    TdfpmCalculatorService, // P1: TDFPM → fatigueTrend（ClaudeOrchestrator 接入）
    AbuStrategy, // 必需：DecisionAbuCheckSkill 需要它
    DrDreStrategy, // 必需：DecisionDrdrePaceSkill 需要它
    NeptuneStrategy, // 必需：DecisionNeptuneRepairSkill 需要它
    // PlanConverterService,
    // 二分法：暂时禁用后半部分非必需服务，测试是否导致阻塞
    DecisionStatsService, // 恢复：DecisionStatsController 需要
    HeuristicDietService, // 恢复：DecisionStatsController 需要
    // TripFeedbackService,
    DecisionLogStorageService, // 必需：TripsService 需要它
    OpsRealityAuditService, // P-OPS-2：reality audit snapshots（需 OPS_REALITY_AUDIT=1 + DB migration）
    OperationalPolicyService, // P-OPS-3：versioned operational policy（OPS_OPERATIONAL_POLICY_JSON）
    DecisionLoggingService, // 决策日志记录服务（logDecision、logOutcome）
    DecisionStateManagerService, // 决策状态管理服务
    { provide: DSO_LATEST_STATE_PROVIDER, useClass: DsoLatestStateFromTripProvider },
    ThreeLayerExplanationService, // 三层解释服务
    RhythmMatchingService, // 节奏匹配服务（路线节奏特性提取、用户节奏容量提取、动态节奏调整）
    MultiPersonDecisionService, // 多人决策协调服务（冲突分析、协调方案生成、群体决策支持）
    DailyUtilityCalculatorService, // Phase 2：日级 Utility 计算
    UserProfileWeightsService, // Phase 2 扩展：个性化权重 w = f(user_profile)
    ExpectedUtilityLogService, // Phase 3：ExpectedUtility 评估日志
    PlanModificationLogService, // Phase 3：用户修改行为日志
    // E2ECaseStorageService,
    // E2EReplayService,
    DecisionLogClusteringService, // 恢复：DecisionStatsController 需要
    // TripNaraCoreToolService,
    // GraphDataConverterService,
    // PlannerAgentService, // 已测试，不是问题
    // NarratorAgentService, // 已测试，不是问题
    // LangGraphOrchestratorService, // 已测试，不是问题
    ReadinessAgentService, // 必需：SkillsModule 需要它
    ApprovalService, // 恢复：ApprovalController 需要
    AgentResumeService, // 恢复：ApprovalController 需要
    // ApprovalCleanupScheduler,
    FitnessAssessmentService, // Phase 1：体能评估服务
    // Phase 2：体能数据分析服务
    FitnessAnalyticsService,
    FitnessABTestingService,
    CalibrationSchedulerService,
    WearableIntegrationService,
  ],
  exports: [
    EcoIdentityLedgerPersistenceService,
    TripDecisionEngineService,
    DSO_LATEST_STATE_PROVIDER,
    // 二分法：暂时禁用最后2个服务，测试是否导致阻塞
    // CandidatePoolService,
    // TravelReliabilityService,
    // 二分法：暂时禁用前半部分的前半的前半的后半 providers，测试是否导致阻塞
    // EventTriggerService,
    // EvaluationService,
    // VersionService,
    ExplainabilityService, // 决策引擎 API explain-plan 需要
    // LearningService,
    // AdvancedConstraintsService,
    ConstraintChecker, // 恢复：约束检查器（集成冲突检测）
    ConstraintEngineService, // Phase 0：isFeasible 统一入口
    DailyUtilityCalculatorService, // Phase 2：日级 Utility 计算
    UserProfileWeightsService, // Phase 2 扩展：个性化权重 w = f(user_profile)
    ExpectedUtilityLogService, // Phase 3：ExpectedUtility 评估日志
    PlanModificationLogService, // Phase 3：用户修改行为日志
    ConstraintDSLCompiler, // 新增：约束DSL编译器
    ConstraintConflictResolver, // 新增：约束冲突解析器
    RoadConstraintPropagationService,
    MultiPlanGenerator, // 新增：多方案生成器
    FeedbackCollectorService, // P2：反馈收集服务
    QualityAssessorService, // P2：质量评估服务
    MemoryUpdaterService, // P2：记忆更新服务
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
    WeatherDecisionEvidenceService,
    // PersonaExplanationService,
    StrategyOrchestratorService, // 恢复：让 SkillsModule 可以注入（DecisionRunThreeGuardiansSkill 需要它）
    SpatialReplacementService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    SpatialIssueDetectorService, // 必需：NeptuneStrategy 需要它（DecisionNeptuneRepairSkill 需要 NeptuneStrategy）
    FatigueCalculatorService, // 必需：DrDreStrategy 需要它（DecisionDrdrePaceSkill 需要 DrDreStrategy）
    DrivingSafetyConcernService, // 驾驶安全关注点（驾驶进入危险区 → 三人格提醒）
    TdfpmCalculatorService, // P1: TDFPM → fatigueTrend（ClaudeOrchestrator 接入）
    AbuStrategy, // 必需：DecisionAbuCheckSkill 需要它
    DrDreStrategy, // 必需：DecisionDrdrePaceSkill 需要它
    NeptuneStrategy, // 必需：DecisionNeptuneRepairSkill 需要它
    // PlanConverterService,
    // 二分法：暂时禁用后半部分非必需服务，测试是否导致阻塞
    DecisionStatsService, // 恢复：DecisionStatsController 需要
    HeuristicDietService, // 恢复：DecisionStatsController 需要
    // TripFeedbackService,
    DecisionLogStorageService, // 必需：TripsService 需要它
    DecisionLoggingService, // 决策日志记录服务（logDecision、logOutcome）
    DecisionStateManagerService, // 决策状态管理服务
    ThreeLayerExplanationService, // 三层解释服务
    RhythmMatchingService, // 节奏匹配服务（路线节奏特性提取、用户节奏容量提取、动态节奏调整）
    MultiPersonDecisionService, // 多人决策协调服务（冲突分析、协调方案生成、群体决策支持）
    // E2ECaseStorageService,
    // E2EReplayService,
    DecisionLogClusteringService, // 恢复：DecisionStatsController 需要
    // TripNaraCoreToolService,
    // GraphDataConverterService,
    // PlannerAgentService, // 已测试，不是问题
    // NarratorAgentService, // 已测试，不是问题
    // LangGraphOrchestratorService, // 已测试，不是问题
    ReadinessAgentService, // 必需：SkillsModule 需要它
    ApprovalService, // 恢复：ApprovalController 需要
    AgentResumeService, // 恢复：ApprovalController 需要
    FitnessAssessmentService, // Phase 1：体能评估服务
    // Phase 2：体能数据分析服务
    FitnessAnalyticsService,
    FitnessABTestingService,
    CalibrationSchedulerService,
    WearableIntegrationService,
    // Phase 1/2/3: 优化模块服务（通过 re-export）
    // OptimizationModule 已通过 imports 导入，相关服务通过该模块获取
  ],
})
export class DecisionModule {}

