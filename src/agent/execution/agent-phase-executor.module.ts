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

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DomainAgentsModule } from '../services/domain-agents/domain-agents.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorldModelCollectorService } from './shared/world-model-collector.service';
import { PredictionCollectorService } from './shared/prediction-collector.service';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';
import { ResearchExecutorService } from './research-executor.service';
import { GateEvalExecutorService } from './gate-eval-executor.service';
import { PlanGenExecutorService } from './plan-gen-executor.service';
import { VerifyExecutorService } from './verify-executor.service';
import { RepairExecutorService } from './repair-executor.service';
import { IntakeExecutorService } from './intake-executor.service';
import { NarrateExecutorService } from './narrate-executor.service';
import { WeatherPredictionService } from '../../skills/world/services/weather-prediction.service';
import { FailureRiskPredictionService } from '../../skills/world/services/failure-risk-prediction.service';
import { CountryConfigService } from '../../skills/world/services/country-config.service';
import { SkillsModule } from '../../skills/skills.module';
import { ReadinessModule } from '../../trips/readiness/readiness.module';
import { AgentModule } from '../agent.module';

@Module({
  imports: [
    DomainAgentsModule,
    PrismaModule,
    ConfigModule,
    forwardRef(() => SkillsModule), // SkillsRegistryService for transport/poi/dem/geo skills
    forwardRef(() => ReadinessModule), // ReadinessService, UserDecisionService for GATE_EVAL
    forwardRef(() => AgentModule), // ClaudeGatekeeperAgentService for GATE_EVAL
  ],
  providers: [
    CountryConfigService,
    WeatherPredictionService,
    FailureRiskPredictionService,
    WorldModelCollectorService,
    PredictionCollectorService,
    TripContextExtractorService,
    ResearchExecutorService,
    GateEvalExecutorService,
    PlanGenExecutorService,
    VerifyExecutorService,
    RepairExecutorService,
    IntakeExecutorService,
    NarrateExecutorService,
  ],
  exports: [
    WorldModelCollectorService,
    PredictionCollectorService,
    TripContextExtractorService,
    ResearchExecutorService,
    GateEvalExecutorService,
    PlanGenExecutorService,
    VerifyExecutorService,
    RepairExecutorService,
    IntakeExecutorService,
    NarrateExecutorService,
  ],
})
export class AgentPhaseExecutorModule {}
