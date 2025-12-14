// src/providers/providers.module.ts

import { Module } from '@nestjs/common';
import { MockOcrProvider } from './ocr/mock-ocr.provider';
import { MockPoiProvider } from './poi/mock-poi.provider';
import { GoogleOcrProvider } from './ocr/google-ocr.provider';
import { GooglePoiProvider } from './poi/google-poi.provider';
import { MockAsrProvider } from './asr/mock-asr.provider';
import { MockTtsProvider } from './tts/mock-tts.provider';

/**
 * Providers 模块
 * 
 * 统一管理 OCR、POI、ASR 和 TTS Provider 的注册
 * 支持 Mock Provider（开发和测试）和真实 Provider（Google Vision、Google Places 等）
 * 
 * 使用方式：
 * - 默认使用 Mock Provider
 * - 设置环境变量启用真实 Provider：
 *   - GOOGLE_VISION_API_KEY: 启用 GoogleOcrProvider
 *   - GOOGLE_PLACES_API_KEY: 启用 GooglePoiProvider
 */
@Module({
  providers: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    MockTtsProvider,
  ],
  exports: [
    MockOcrProvider,
    MockPoiProvider,
    GoogleOcrProvider,
    GooglePoiProvider,
    MockAsrProvider,
    MockTtsProvider,
  ],
})
export class ProvidersModule {}
