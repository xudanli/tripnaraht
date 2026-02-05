// src/chain-of-work/chain-of-work.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { ChainOfWorkController } from './controllers/chain-of-work.controller';
import { ChainOfWorkAdminController } from './controllers/chain-of-work-admin.controller';
import { ChainOfWorkService } from './services/chain-of-work.service';
import { ChainOfWorkStorageService } from './storage/chain-of-work-storage.service';
import { DraftGeneratorService } from './draft/draft-generator.service';
import { DraftValidatorService } from './draft/draft-validator.service';
import { DraftEditorService } from './draft/draft-editor.service';
import { SkillMappingService } from './mapping/skill/skill-mapping.service';
import { SubAgentMappingService } from './mapping/sub-agent/sub-agent-mapping.service';
import { ExecutionPlanGeneratorService } from './execution/execution-plan-generator.service';
import { ExecutionIntegrationService } from './execution/execution-integration.service';
import { VersionService } from './version/version.service';
import { AgentModule } from '../agent/agent.module';
import { SkillsModule } from '../skills/skills.module';
import { LlmModule } from '../llm/llm.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AgentModule), // 使用 forwardRef 避免循环依赖（AgentModule -> DecisionDraftModule -> ChainOfWorkModule）
    forwardRef(() => SkillsModule), // 使用 forwardRef 避免循环依赖（ChainOfWorkModule -> SkillsModule -> ... -> DecisionDraftModule -> ChainOfWorkModule）
    LlmModule,
  ],
  controllers: [ChainOfWorkController, ChainOfWorkAdminController],
  providers: [
    ChainOfWorkService,
    ChainOfWorkStorageService,
    DraftGeneratorService,
    DraftValidatorService,
    DraftEditorService,
    SkillMappingService,
    SubAgentMappingService,
    ExecutionPlanGeneratorService,
    ExecutionIntegrationService,
    VersionService,
  ],
  exports: [
    ChainOfWorkService,
    ChainOfWorkStorageService,
    DraftGeneratorService,
    SkillMappingService,
    SubAgentMappingService,
    VersionService,
  ],
})
export class ChainOfWorkModule {}