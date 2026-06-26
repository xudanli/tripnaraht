import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LlmModule } from '../../llm/llm.module';
import { NarrativeThemeController } from './controllers/narrative-theme.controller';
import { NarrativeThemeService } from './services/narrative-theme.service';
import { NarrativeThemeGeneratorService } from './services/narrative-theme-generator.service';
import { NarrativeFeatureGuard } from './guards/narrative-feature.guard';
import { TravelEventPersistenceService } from '../event-store/travel-event-persistence.service';

@Module({
  imports: [PrismaModule, LlmModule],
  controllers: [NarrativeThemeController],
  providers: [
    NarrativeThemeService,
    NarrativeThemeGeneratorService,
    NarrativeFeatureGuard,
    TravelEventPersistenceService,
  ],
  exports: [NarrativeThemeService, NarrativeThemeGeneratorService],
})
export class NarrativeEngineModule {}
