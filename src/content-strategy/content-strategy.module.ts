// src/content-strategy/content-strategy.module.ts

import { Module } from '@nestjs/common';
import { CopyStandardsService } from './services/copy-standards.service';
import { UserJourneyCommunicationService } from './services/user-journey-communication.service';
import { BrandExpressionService } from './services/brand-expression.service';
import { PersonaBasedCommunicationService } from './services/persona-based-communication.service';
import { CopyExampleLibraryService } from './services/copy-example-library.service';
import { BrandStoryService } from './services/brand-story.service';
import { LocalizationService } from './services/localization.service';
import { ContentStrategyQAService } from './services/content-strategy-qa.service';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { DecisionModule } from '../trips/decision/decision.module';

@Module({
  imports: [RouteDirectionsModule, DecisionModule],
  providers: [
    CopyStandardsService,
    UserJourneyCommunicationService,
    BrandExpressionService,
    PersonaBasedCommunicationService,
    CopyExampleLibraryService,
    BrandStoryService,
    LocalizationService,
    ContentStrategyQAService,
  ],
  exports: [
    CopyStandardsService,
    UserJourneyCommunicationService,
    BrandExpressionService,
    PersonaBasedCommunicationService,
    CopyExampleLibraryService,
    BrandStoryService,
    LocalizationService,
    ContentStrategyQAService,
  ],
})
export class ContentStrategyModule {}
