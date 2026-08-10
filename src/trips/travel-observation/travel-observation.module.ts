import { Module, forwardRef } from '@nestjs/common';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { LookDecisionProblemStore } from './assessment/look-decision-problem.store';
import { LOOK_RFC001_WRITER } from './assessment/look-decision-problem.port';
import { LookRfc001ProjectionService } from './assessment/look-rfc001-projection.service';
import { LookTripDecisionContextResolver } from './assessment/look-trip-decision-context.resolver';
import { LookWorldStateAssertionService } from './assessment/look-world-state-assertion.service';
import { ObservationAssessmentBridgeService } from './assessment/observation-assessment.bridge.service';
import { Rfc001LookDecisionProblemWriterAdapter } from './assessment/rfc001-look-decision-problem.writer';
import { HeuristicExtractionProvider } from './extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from './extraction/observation-extraction.service';
import { ObservationGroundingService } from './grounding/observation-grounding.service';
import { ObservationController } from './observation.controller';
import { ObservationRepository } from './observation.repository';
import { ObservationService } from './observation.service';
import { LookFeedbackStore } from './feedback/look-feedback.store';
import { LookMediaController } from './look-media/look-media.controller';
import { LookMediaStore } from './look-media/look-media.store';
import { RentalEvidencePackageStore } from './rental/rental-evidence.store';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => DecisionGatewayModule),
  ],
  controllers: [ObservationController, LookMediaController],
  providers: [
    ObservationRepository,
    HeuristicExtractionProvider,
    ObservationExtractionService,
    ObservationGroundingService,
    LookDecisionProblemStore,
    LookTripDecisionContextResolver,
    LookWorldStateAssertionService,
    Rfc001LookDecisionProblemWriterAdapter,
    {
      provide: LOOK_RFC001_WRITER,
      useExisting: Rfc001LookDecisionProblemWriterAdapter,
    },
    LookRfc001ProjectionService,
    ObservationAssessmentBridgeService,
    RentalEvidencePackageStore,
    LookFeedbackStore,
    LookMediaStore,
    ObservationService,
  ],
  exports: [
    ObservationService,
    ObservationRepository,
    ObservationExtractionService,
    ObservationGroundingService,
    ObservationAssessmentBridgeService,
    LookDecisionProblemStore,
    LookRfc001ProjectionService,
    LookTripDecisionContextResolver,
    LookWorldStateAssertionService,
    RentalEvidencePackageStore,
    LookFeedbackStore,
    LookMediaStore,
  ],
})
export class TravelObservationModule {}
