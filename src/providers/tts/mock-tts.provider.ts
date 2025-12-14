// src/providers/tts/mock-tts.provider.ts

import { Injectable } from '@nestjs/common';
import { TtsProvider, TtsResult } from './tts.provider.interface';

/**
 * Mock TTS Provider（用于开发和测试）
 */
@Injectable()
export class MockTtsProvider implements TtsProvider {
  async speak(
    text: string,
    options?: { locale?: string; voice?: string; format?: 'mp3' | 'wav' | 'ogg' }
  ): Promise<TtsResult> {
    // 模拟 TTS 延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 返回模拟的音频 Buffer（实际应该是真实的音频数据）
    const mockAudioBuffer = Buffer.from('mock-audio-data');

    return {
      audioBuffer: mockAudioBuffer,
      format: options?.format || 'mp3',
      duration: text.length * 0.1, // 简单估算：每个字符 0.1 秒
    };
  }
}
