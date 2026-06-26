import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripBudgetOsModule } from '../budget-os/budget-os.module';
import { TripDecisionProfilingController } from './trip-decision-profiling.controller';
import { DecisionProfilingAccessService } from './services/decision-profiling-access.service';
import { DecisionProfilingService } from './services/decision-profiling.service';
import { DecisionProfilingProfileService } from './services/decision-profiling-profile.service';
import { TravelStyleQuizService } from './services/travel-style-quiz.service';
import { MoneyDnaQuizService } from './services/money-dna-quiz.service';
import { FrictionRadarService } from './services/friction-radar.service';
import { SplitConsensusService } from './services/split-consensus.service';
import { DecisionProfilingOrchestratorService } from './services/decision-profiling-orchestrator.service';

@Module({
  imports: [PrismaModule, TripBudgetOsModule],
  controllers: [TripDecisionProfilingController],
  providers: [
    DecisionProfilingAccessService,
    DecisionProfilingProfileService,
    DecisionProfilingService,
    TravelStyleQuizService,
    MoneyDnaQuizService,
    FrictionRadarService,
    SplitConsensusService,
    DecisionProfilingOrchestratorService,
  ],
  exports: [
    DecisionProfilingAccessService,
    DecisionProfilingProfileService,
    DecisionProfilingService,
    TravelStyleQuizService,
    MoneyDnaQuizService,
    FrictionRadarService,
    SplitConsensusService,
    DecisionProfilingOrchestratorService,
  ],
})
export class TripDecisionProfilingModule {}
