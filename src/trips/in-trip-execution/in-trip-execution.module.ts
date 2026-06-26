import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripBudgetOsModule } from '../budget-os/budget-os.module';
import { TripDecisionProfilingModule } from '../decision-profiling/decision-profiling.module';
import { TravelEventStoreModule } from '../event-store/travel-event-store.module';
import { TripSilentVoteModule } from '../silent-vote/trip-silent-vote.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { LoopsModule } from '../../loops/loops.module';
import { TripEnvironmentRadarController } from './controllers/trip-environment-radar.controller';
import { TripMoneyBrainController } from './controllers/trip-money-brain.controller';
import { TripInTripController } from './controllers/trip-in-trip.controller';
import { TripGroupPulseController } from './controllers/trip-group-pulse.controller';
import { TripSplitOrchestratorController } from './controllers/trip-split-orchestrator.controller';
import { TripExperienceLoopController } from './controllers/trip-experience-loop.controller';
import { TripInTripBetaController } from './controllers/trip-in-trip-beta.controller';
import { ExperienceWeightJob } from './jobs/experience-weight.job';
import { ExperiencePulseService } from './services/experience-pulse.service';
import { PostTripSummaryService } from './services/post-trip-summary.service';
import { RecommendationWeightService } from './services/recommendation-weight.service';
import { GroupPulseService } from './services/group-pulse.service';
import { MemberStateVectorService } from './services/member-state-vector.service';
import { ProtectiveInterventionService } from './services/protective-intervention.service';
import { RelationRiskService } from './services/relation-risk.service';
import { SplitOrchestratorService } from './services/split-orchestrator.service';
import { TeamThermometerService } from './services/team-thermometer.service';
import { EnvironmentMonitorJob } from './jobs/environment-monitor.job';
import { AlternativePlanGeneratorService } from './services/alternative-plan-generator.service';
import { AnchorHandoffService } from './services/anchor-handoff.service';
import { InTripBetaMetricsService } from './services/in-trip-beta-metrics.service';
import { InTripMorningPackService } from './services/in-trip-morning-pack.service';
import { InTripOfflineSyncService } from './services/in-trip-offline-sync.service';
import { BudgetRebalanceService } from './services/budget-rebalance.service';
import { EnvironmentDataAdapter } from './services/environment-data.adapter';
import { EnvironmentRadarService } from './services/environment-radar.service';
import { InTripAccessService } from './services/in-trip-access.service';
import { MoneyBrainNudgeService } from './services/money-brain-nudge.service';
import { SmartTransactionService } from './services/smart-transaction.service';
import { TripTodayService } from './services/trip-today.service';
import { VulnerabilityScoreService } from './services/vulnerability-score.service';

@Module({
  imports: [
    PrismaModule,
    TripBudgetOsModule,
    TripDecisionProfilingModule,
    TravelEventStoreModule,
    TripSilentVoteModule,
    forwardRef(() => ReadinessModule),
    forwardRef(() => LoopsModule),
  ],
  controllers: [
    TripInTripController,
    TripEnvironmentRadarController,
    TripMoneyBrainController,
    TripGroupPulseController,
    TripSplitOrchestratorController,
    TripExperienceLoopController,
    TripInTripBetaController,
  ],
  providers: [
    InTripAccessService,
    AnchorHandoffService,
    InTripMorningPackService,
    InTripOfflineSyncService,
    InTripBetaMetricsService,
    TripTodayService,
    EnvironmentDataAdapter,
    VulnerabilityScoreService,
    AlternativePlanGeneratorService,
    EnvironmentRadarService,
    EnvironmentMonitorJob,
    MoneyBrainNudgeService,
    SmartTransactionService,
    BudgetRebalanceService,
    MemberStateVectorService,
    TeamThermometerService,
    RelationRiskService,
    ProtectiveInterventionService,
    GroupPulseService,
    SplitOrchestratorService,
    ExperiencePulseService,
    RecommendationWeightService,
    PostTripSummaryService,
    ExperienceWeightJob,
  ],
  exports: [
    InTripAccessService,
    AnchorHandoffService,
    InTripMorningPackService,
    TripTodayService,
    EnvironmentRadarService,
    VulnerabilityScoreService,
    SmartTransactionService,
    BudgetRebalanceService,
    GroupPulseService,
    SplitOrchestratorService,
    ExperiencePulseService,
    PostTripSummaryService,
  ],
})
export class InTripExecutionModule {}
