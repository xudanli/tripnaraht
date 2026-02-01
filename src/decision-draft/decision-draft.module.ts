// src/decision-draft/decision-draft.module.ts

/**
 * Decision Draft Module
 * 
 * Decision-First Agent 引擎模块
 * 融合 Chain-of-Work 引擎
 */

import { Module, forwardRef } from '@nestjs/common';
import { DecisionDraftGeneratorService } from './services/decision-draft-generator.service';
import { DecisionDraftEditorService } from './services/decision-draft-editor.service';
import { DecisionExplanationService } from './services/decision-explanation.service';
import { DecisionDraftVersionService } from './services/decision-draft-version.service';
import { DecisionDraftStorageService } from './storage/decision-draft-storage.service';
import { DecisionDraftObservabilityService } from './services/decision-draft-observability.service';
import { DecisionDebugCollectorService } from './services/decision-debug-collector.service';
import { DecisionTypeToStepDraftMapper } from './mapping/decision-type-to-step-draft.mapper';
import { DecisionDraftController } from './controllers/decision-draft.controller';
import { StudioModeGuard } from './guards/studio-mode.guard';
import { ChainOfWorkModule } from '../chain-of-work/chain-of-work.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    forwardRef(() => ChainOfWorkModule), // 使用 forwardRef 避免循环依赖（ChainOfWorkModule -> AgentModule -> DecisionDraftModule）
    LlmModule,
    PrismaModule,
  ],
  controllers: [DecisionDraftController],
  providers: [
    DecisionDraftGeneratorService,
    DecisionDraftEditorService,
    DecisionExplanationService,
    DecisionDraftVersionService,
    DecisionDraftStorageService,
    DecisionDraftObservabilityService,
    DecisionDebugCollectorService,
    DecisionTypeToStepDraftMapper,
    StudioModeGuard,
  ],
  exports: [
    DecisionDraftGeneratorService,
    DecisionDraftEditorService,
    DecisionExplanationService,
    DecisionDraftVersionService,
    DecisionDraftStorageService,
    DecisionDraftObservabilityService,
    DecisionDebugCollectorService,
    DecisionTypeToStepDraftMapper,
    StudioModeGuard,
  ],
})
export class DecisionDraftModule {}