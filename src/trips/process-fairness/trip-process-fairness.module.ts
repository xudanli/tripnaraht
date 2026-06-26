import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PreferenceRoundController } from './preference-round.controller';
import { VoiceGuardController } from './voice-guard.controller';
import { PreferenceRoundService } from './services/preference-round.service';
import { TripPreferenceRoundAccessService } from './services/trip-preference-round-access.service';
import { VoiceGuardService } from './services/voice-guard.service';
import { PreferenceRoundOrchestratorService } from './services/preference-round-orchestrator.service';

@Module({
  imports: [PrismaModule],
  controllers: [PreferenceRoundController, VoiceGuardController],
  providers: [
    PreferenceRoundService,
    TripPreferenceRoundAccessService,
    VoiceGuardService,
    PreferenceRoundOrchestratorService,
  ],
  exports: [
    PreferenceRoundService,
    VoiceGuardService,
    PreferenceRoundOrchestratorService,
  ],
})
export class TripProcessFairnessModule {}
