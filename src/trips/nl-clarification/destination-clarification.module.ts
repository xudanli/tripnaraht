// src/trips/nl-clarification/destination-clarification.module.ts

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { CountriesModule } from '../../countries/countries.module';
import { DestinationClarificationConfigService } from './services/destination-clarification-config.service';
import { GatePrecheckService } from './services/gate-precheck.service';
import { AiDecisionLogicService } from './services/ai-decision-logic.service';
import { DestinationClarificationController } from './destination-clarification.controller';

@Module({
  imports: [PrismaModule, LlmModule, CountriesModule],
  providers: [
    DestinationClarificationConfigService,
    GatePrecheckService,
    AiDecisionLogicService,
  ],
  controllers: [DestinationClarificationController],
  exports: [
    DestinationClarificationConfigService,
    GatePrecheckService,
    AiDecisionLogicService,
  ],
})
export class DestinationClarificationModule {}
