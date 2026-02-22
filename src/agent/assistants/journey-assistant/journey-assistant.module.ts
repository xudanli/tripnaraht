// src/agent/assistants/journey-assistant/journey-assistant.module.ts
/**
 * 行程助手模块
 * 
 * V2.1 架构更新：
 * - 引入 AgentInfraModule (LLMExecutor, CoreGateway)
 * - JourneyAssistant 只下发 ChangeIntent，不直接修改行程
 */

import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JourneyAssistantService } from './services/journey-assistant.service';
import { JourneyAssistantController } from './journey-assistant.controller';
import { LlmModule } from '../../../llm/llm.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AgentInfraModule } from '../../infra/infra.module';
import { PlacesModule } from '../../../places/places.module';
import { ProvidersModule } from '../../../providers/providers.module';

@Module({
  imports: [
    LlmModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    AgentInfraModule, // V2.1: Infra层 (LLMExecutor, CoreGateway)
    forwardRef(() => PlacesModule), // POI 搜索（避免循环依赖）
    forwardRef(() => ProvidersModule), // Google Places API
  ],
  controllers: [JourneyAssistantController],
  providers: [JourneyAssistantService],
  exports: [JourneyAssistantService],
})
export class JourneyAssistantModule {}
