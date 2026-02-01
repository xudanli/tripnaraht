// src/llm/llm.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './services/llm.service';
import { LlmController } from './llm.controller';
import { LlmCostService } from './services/llm-cost.service';
import { PythonAIService } from './services/python-ai.service';
import { LlmResponseTransformerService } from './services/llm-response-transformer.service';
import { AgentInfraModule } from '../agent/infra/infra.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AgentInfraModule), // 使用 forwardRef 解决循环依赖
  ],
  controllers: [LlmController],
  providers: [LlmService, LlmCostService, PythonAIService, LlmResponseTransformerService],
  exports: [LlmService, LlmCostService, PythonAIService, LlmResponseTransformerService], // 🆕 导出响应转换服务
})
export class LlmModule {}
