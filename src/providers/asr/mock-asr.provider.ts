// src/providers/asr/mock-asr.provider.ts

import { Injectable } from '@nestjs/common';
import { AsrProvider, AsrResult } from './asr.provider.interface';

/**
 * Mock ASR Provider（用于开发和测试）
 */
@Injectable()
export class MockAsrProvider implements AsrProvider {
  async transcribe(
    audioBuffer: Buffer,
    options?: { language?: string; format?: string }
  ): Promise<AsrResult> {
    // 模拟转写延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回模拟结果
    return {
      transcript: '下一站是哪里？',
      words: [
        { word: '下一站', start: 0.0, end: 0.5 },
        { word: '是', start: 0.5, end: 0.7 },
        { word: '哪里', start: 0.7, end: 1.2 },
      ],
      language: options?.language || 'zh-CN',
      confidence: 0.95,
    };
  }
}
