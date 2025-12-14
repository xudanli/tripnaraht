// src/voice/voice.module.ts

import { Module } from '@nestjs/common';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { LlmVoiceParserService } from './services/llm-voice-parser.service';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [ProvidersModule],
  controllers: [VoiceController],
  providers: [
    VoiceService,
    // LLM 解析器（可选，通过环境变量启用）
    LlmVoiceParserService,
  ],
  exports: [VoiceService],
})
export class VoiceModule {}
