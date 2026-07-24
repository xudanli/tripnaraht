import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { TransportModule } from '../../transport/transport.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { ArrangeItineraryModule } from '../arrange-itinerary/arrange-itinerary.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { ContextualRecommendationsController } from './contextual-recommendations.controller';
import { ContextualRecommendationsService } from './services/contextual-recommendations.service';
import { ContextualRecommendationsCommitService } from './services/contextual-recommendations-commit.service';
import { SameDayContextBuilderService } from './services/same-day-context-builder.service';
import { SameDayIntentCompileService } from './services/same-day-intent-compile.service';
import { SameDayLocalCandidatesService } from './services/same-day-local-candidates.service';
import { SameDayTravelEtaService } from './services/same-day-travel-eta.service';

@Module({
  imports: [
    PrismaModule,
    TransportModule,
    TripConstraintSolverModule,
    ArrangeItineraryModule,
    GuardianDecisionCoreModule,
    forwardRef(() => LlmModule),
  ],
  controllers: [ContextualRecommendationsController],
  providers: [
    ContextualRecommendationsService,
    ContextualRecommendationsCommitService,
    SameDayContextBuilderService,
    SameDayIntentCompileService,
    SameDayLocalCandidatesService,
    SameDayTravelEtaService,
  ],
  exports: [
    ContextualRecommendationsService,
    ContextualRecommendationsCommitService,
    SameDayContextBuilderService,
    SameDayIntentCompileService,
    SameDayLocalCandidatesService,
    SameDayTravelEtaService,
  ],
})
export class ContextualRecommendationsModule {}
