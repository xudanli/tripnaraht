// src/providers/tts/tts.provider.interface.ts

/**
 * TTS (Text-to-Speech) Provider 接口
 * 
 * 支持多种 TTS 服务提供商（OpenAI TTS, Google Text-to-Speech, Azure Speech 等）
 */
export interface TtsProvider {
  /**
   * 将文字转换为语音
   * 
   * @param text 要转换的文字
   * @param options 选项（语言、声音、格式等）
   * @returns 音频 Buffer 或 URL
   */
  speak(
    text: string,
    options?: {
      locale?: string; // 语言代码，如 'zh-CN', 'en-US', 'ja-JP'
      voice?: string; // 声音名称，如 'alloy', 'echo', 'fable'
      format?: 'mp3' | 'wav' | 'ogg'; // 音频格式
    }
  ): Promise<TtsResult>;
}

/**
 * TTS 转换结果
 */
export interface TtsResult {
  /** 音频 Buffer（如果直接返回音频） */
  audioBuffer?: Buffer;
  /** 音频 URL（如果返回 URL） */
  audioUrl?: string;
  /** 音频格式 */
  format: 'mp3' | 'wav' | 'ogg';
  /** 音频时长（秒，可选） */
  duration?: number;
}
