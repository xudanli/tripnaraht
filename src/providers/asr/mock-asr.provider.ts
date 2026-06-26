// src/providers/asr/mock-asr.provider.ts

import { Injectable } from '@nestjs/common';
import { AsrProvider, AsrResult } from './asr.provider.interface';

/**
 * Mock ASR Provider（用于开发和测试）
 * 可通过 WISH_MOCK_STT_TRANSCRIPT 覆盖默认转写文本（愿望单语音联调）
 */
@Injectable()
export class MockAsrProvider implements AsrProvider {
  async transcribe(
    audioBuffer: Buffer,
    options?: { language?: string; format?: string },
  ): Promise<AsrResult> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const transcript =
      process.env.WISH_MOCK_STT_TRANSCRIPT?.trim() ||
      '想住一晚玻璃屋看极光，行程不要太赶。';

    return {
      transcript,
      words: transcript.split(/\s+/).map((word, index) => ({
        word,
        start: index * 0.4,
        end: (index + 1) * 0.4,
      })),
      language: options?.language || 'zh-CN',
      confidence: 0.9,
    };
  }
}
