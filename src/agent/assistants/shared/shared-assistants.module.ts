// src/agent/assistants/shared/shared-assistants.module.ts

/**
 * SharedAssistantsModule
 * 
 * 助手共享服务模块：提供所有助手智能体共用的服务
 * 
 * 包含服务：
 * - PersonaLanguageService: 人格语言风格服务
 * - RecommendationEngineService: 推荐引擎服务
 * - PreferenceLearningService: 偏好学习服务
 */

import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { LlmModule } from '../../../llm/llm.module';
import { PersonaLanguageService } from './services/persona-language.service';
import { RecommendationEngineService } from './services/recommendation-engine.service';
import { PreferenceLearningService } from './services/preference-learning.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    LlmModule,
  ],
  providers: [
    PersonaLanguageService,
    RecommendationEngineService,
    PreferenceLearningService,
  ],
  exports: [
    PersonaLanguageService,
    RecommendationEngineService,
    PreferenceLearningService,
  ],
})
export class SharedAssistantsModule {}
