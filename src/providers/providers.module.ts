// src/providers/providers.module.ts

import { Module } from '@nestjs/common';
import { MockOcrProvider } from './ocr/mock-ocr.provider';
import { MockPoiProvider } from './poi/mock-poi.provider';
import { GoogleOcrProvider } from './ocr/google-ocr.provider';
import { DeepSeekOcrProvider } from './ocr/deepseek-ocr.provider';
import { GooglePoiProvider } from './poi/google-poi.provider';
import { MockAsrProvider } from './asr/mock-asr.provider';
import { OpenAiWhisperAsrProvider } from './asr/openai-whisper-asr.provider';
import { MockTtsProvider } from './tts/mock-tts.provider';
import { ASR_PROVIDER } from './asr/asr.provider.token';
import type { AsrProvider } from './asr/asr.provider.interface';

function createAsrProvider(): AsrProvider {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return new OpenAiWhisperAsrProvider();
  }
  return new MockAsrProvider();
}

/**
 * Providers 模块
 *
 * 统一管理 OCR、POI、ASR 和 TTS Provider 的注册
 * 支持 Mock Provider（开发和测试）和真实 Provider
 *
 * OCR 优先级：DeepSeek-OCR > Google Vision > Mock
 * ASR 优先级：OpenAI Whisper（OPENAI_API_KEY）> Mock
 */
@Module({
  providers: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    DeepSeekOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    OpenAiWhisperAsrProvider,
    MockTtsProvider,
    {
      provide: ASR_PROVIDER,
      useFactory: createAsrProvider,
    },
  ],
  exports: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    DeepSeekOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    OpenAiWhisperAsrProvider,
    MockTtsProvider,
    ASR_PROVIDER,
  ],
})
export class ProvidersModule {}
