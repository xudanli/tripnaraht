// src/llm/llm.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './services/llm.service';
import { LlmController } from './llm.controller';
import { LlmCostService } from './services/llm-cost.service';
import { AgentInfraModule } from '../agent/infra/infra.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AgentInfraModule), // 使用 forwardRef 解决循环依赖
  ],
  controllers: [LlmController],
  providers: [LlmService, LlmCostService],
  exports: [LlmService, LlmCostService],
})
export class LlmModule {}
