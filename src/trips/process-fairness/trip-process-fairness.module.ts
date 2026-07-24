import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PreferenceRoundController } from './preference-round.controller';
import { VoiceGuardController } from './voice-guard.controller';
import { DecisionProblemNegotiationController } from './decision-problem-negotiation.controller';
import { PreferenceRoundService } from './services/preference-round.service';
import { TripPreferenceRoundAccessService } from './services/trip-preference-round-access.service';
import { VoiceGuardService } from './services/voice-guard.service';
import { PreferenceRoundOrchestratorService } from './services/preference-round-orchestrator.service';
import { DecisionProblemNegotiationOrchestratorService } from './services/decision-problem-negotiation-orchestrator.service';
import { DecisionProblemPreferenceRoundService } from './services/decision-problem-preference-round.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    PreferenceRoundController,
    VoiceGuardController,
    DecisionProblemNegotiationController,
  ],
  providers: [
    PreferenceRoundService,
    TripPreferenceRoundAccessService,
    VoiceGuardService,
    PreferenceRoundOrchestratorService,
    DecisionProblemNegotiationOrchestratorService,
    DecisionProblemPreferenceRoundService,
  ],
  exports: [
    PreferenceRoundService,
    VoiceGuardService,
    PreferenceRoundOrchestratorService,
    DecisionProblemNegotiationOrchestratorService,
    DecisionProblemPreferenceRoundService,
  ],
})
export class TripProcessFairnessModule {}
