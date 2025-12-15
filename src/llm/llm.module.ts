// src/llm/llm.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './services/llm.service';
import { LlmController } from './llm.controller';

@Module({
  imports: [ConfigModule],
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
