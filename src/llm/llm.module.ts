// src/llm/llm.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './services/llm.service';
import { LlmController } from './llm.controller';
import { LlmCostService } from './services/llm-cost.service';
import { PythonAIService } from './services/python-ai.service';
import { AgentInfraModule } from '../agent/infra/infra.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AgentInfraModule), // 使用 forwardRef 解决循环依赖
  ],
  controllers: [LlmController],
  providers: [LlmService, LlmCostService, PythonAIService],
  exports: [LlmService, LlmCostService, PythonAIService], // 导出 PythonAIService 供其他模块使用
})
export class LlmModule {}
