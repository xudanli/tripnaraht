/**
 * AgentPhaseExecutorModule
 *
 * Phase 1 基础设施：共享能力抽离
 * - WorldModelCollectorService
 * - PredictionCollectorService
 * - TripContextExtractorService
 *
 * 后续 Phase 2-5：ResearchExecutor、GateEvalExecutor 等将在此模块实现
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagModule } from '../../rag/rag.module';
import { PoiPitfallInsightService } from '../services/poi-pitfall-insight.service';
import { DomainAgentsModule } from '../services/domain-agents/domain-agents.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorldFactsModule } from '../../world-facts/world-facts.module';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ContextHydrationService } from './shared/context-hydration.service';
import { ResearchPipelineService } from '../teams/research/research-pipeline.service';
import { ResearchTeamLeaderService } from '../teams/research/research-team-leader.service';
import { HotelResearchMember } from '../teams/research/hotel-research.member';
import { FlightResearchMember } from '../teams/research/flight-research.member';
import { TransportResearchMember } from '../teams/research/transport-research.member';
import { DestinationResearchMember } from '../teams/research/destination-research.member';
import { ComplianceResearchMember } from '../teams/research/compliance-research.member';
import { ResearchMemberRegistry } from '../teams/research/research-member.registry';
import { ResearchTeamBusService } from '../teams/research/research-team-bus.service';
import { GateEvalExecutorService } from './gate-eval-executor.service';
import { HardTruthRuleResolverService } from '../services/hard-truth-rule-resolver.service';
import { PlanGenExecutorService } from './plan-gen-executor.service';
import { VerifyExecutorService } from './verify-executor.service';
import { RepairExecutorService } from './repair-executor.service';
import { IntakeExecutorService } from './intake-executor.service';
import { IntakeCompilerService } from './intake-compiler.service';
import { NarrateExecutorService } from './narrate-executor.service';
import { EmotionNarratorOrchestrator } from '../narrator/services/emotion-narrator-orchestrator.service';
import { WeatherPredictionService } from '../../skills/world/services/weather-prediction.service';
import { FailureRiskPredictionService } from '../../skills/world/services/failure-risk-prediction.service';
import { CountryConfigService } from '../../skills/world/services/country-config.service';
import { SkillsModule } from '../../skills/skills.module';
import { ReadinessModule } from '../../trips/readiness/readiness.module';
import { AgentModule } from '../agent.module';
import { RouteFeasibilityEngineService } from '../services/route-feasibility-engine.service';
import { ExtremeScenarioRuleEngineService } from '../services/extreme-scenario-rule-engine.service';
import { TrainingModule } from '../training/training.module';

@Module({
  imports: [
    DomainAgentsModule,
    PrismaModule,
    WorldFactsModule,
    ConfigModule,
    forwardRef(() => SkillsModule), // SkillsRegistryService for transport/poi/dem/geo skills
    forwardRef(() => ReadinessModule), // ReadinessService, UserDecisionService for GATE_EVAL
    forwardRef(() => AgentModule), // ClaudeGatekeeperAgentService for GATE_EVAL
    forwardRef(() => TrainingModule), // ConstraintsEngineService / RuleManager for physical narration hints
    forwardRef(() => RagModule), // ChunkRetrieval for POI pitfall insights
  ],
  providers: [
    PoiPitfallInsightService,
    CountryConfigService,
    WeatherPredictionService,
    FailureRiskPredictionService,
    WorldModelCollectorService,
    PredictionCollectorService,
    TripContextExtractorService,
    ContextHydrationService,
    DestinationResearchMember,
    HotelResearchMember,
    FlightResearchMember,
    TransportResearchMember,
    ComplianceResearchMember,
    ResearchMemberRegistry,
    ResearchTeamBusService,
    ResearchPipelineService,
    ResearchTeamLeaderService,
    HardTruthRuleResolverService,
    GateEvalExecutorService,
    PlanGenExecutorService,
    VerifyExecutorService,
    ExtremeScenarioRuleEngineService,
    RouteFeasibilityEngineService,
    RepairExecutorService,
    IntakeCompilerService,
    IntakeExecutorService,
    NarrateExecutorService,
    EmotionNarratorOrchestrator,
  ],
  exports: [
    WorldModelCollectorService,
    PredictionCollectorService,
    TripContextExtractorService,
    ContextHydrationService,
    ResearchPipelineService,
    ResearchTeamBusService,
    ResearchTeamLeaderService,
    HardTruthRuleResolverService,
    GateEvalExecutorService,
    PlanGenExecutorService,
    VerifyExecutorService,
    RouteFeasibilityEngineService,
    RepairExecutorService,
    IntakeCompilerService,
    IntakeExecutorService,
    NarrateExecutorService,
    EmotionNarratorOrchestrator,
  ],
})
export class AgentPhaseExecutorModule {}
