// src/providers/asr/asr.provider.interface.ts

/**
 * ASR (Automatic Speech Recognition) Provider 接口
 * 
 * 支持多种 ASR 服务提供商（OpenAI Whisper, Google Speech-to-Text, Azure Speech 等）
 */
export interface AsrProvider {
  /**
   * 转写音频文件为文字
   * 
   * @param audioBuffer 音频文件 Buffer
   * @param options 选项（语言、格式等）
   * @returns 转写结果
   */
  transcribe(
    audioBuffer: Buffer,
    options?: {
      language?: string; // 语言代码，如 'zh-CN', 'en-US', 'ja-JP'
      format?: string; // 音频格式，如 'audio/mpeg', 'audio/wav'
    }
  ): Promise<AsrResult>;
}

/**
 * ASR 转写结果
 */
export interface AsrResult {
  /** 转写文本 */
  transcript: string;
  /** 词级时间戳（可选） */
  words?: Array<{
    word: string;
    start: number; // 开始时间（秒）
    end: number; // 结束时间（秒）
  }>;
  /** 语言代码（如果检测到） */
  language?: string;
  /** 置信度（0-1，可选） */
  confidence?: number;
}
