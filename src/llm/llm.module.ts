// src/llm/llm.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './services/llm.service';
import { LlmCostService } from './services/llm-cost.service';
import { LlmUsageRecorderService } from './services/llm-usage-recorder.service';
import { PythonAIService } from './services/python-ai.service';
import { LlmResponseTransformerService } from './services/llm-response-transformer.service';
import { LlmController } from './llm.controller';
import { AgentInfraModule } from '../agent/infra/infra.module';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * LLM 模块
 * 
 * 提供 LLM 相关服务和管理 API
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => AgentInfraModule), // 使用 forwardRef 解决循环依赖
  ],
  controllers: [LlmController],
  providers: [
    LlmService,
    LlmCostService,
    LlmUsageRecorderService,
    PythonAIService,
    LlmResponseTransformerService,
  ],
  exports: [
    LlmService,
    LlmCostService,
    LlmUsageRecorderService,
    PythonAIService,
    LlmResponseTransformerService,
  ],
})
export class LlmModule {}
