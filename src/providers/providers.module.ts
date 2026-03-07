// src/providers/providers.module.ts

import { Module } from '@nestjs/common';
import { MockOcrProvider } from './ocr/mock-ocr.provider';
import { MockPoiProvider } from './poi/mock-poi.provider';
import { GoogleOcrProvider } from './ocr/google-ocr.provider';
import { DeepSeekOcrProvider } from './ocr/deepseek-ocr.provider';
import { GooglePoiProvider } from './poi/google-poi.provider';
import { MockAsrProvider } from './asr/mock-asr.provider';
import { MockTtsProvider } from './tts/mock-tts.provider';

/**
 * Providers 模块
 *
 * 统一管理 OCR、POI、ASR 和 TTS Provider 的注册
 * 支持 Mock Provider（开发和测试）和真实 Provider
 *
 * OCR 优先级：DeepSeek-OCR > Google Vision > Mock
 * - DEEPSEEK_OCR_API_KEY 或 DEEPSEEK_API_KEY: 启用 DeepSeekOcrProvider
 * - GOOGLE_VISION_API_KEY: 启用 GoogleOcrProvider
 */
@Module({
  providers: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    DeepSeekOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    MockTtsProvider,
  ],
  exports: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    DeepSeekOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    MockTtsProvider,
  ],
})
export class ProvidersModule {}
