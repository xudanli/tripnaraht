// src/system/system.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 系统状态服务
 * 
 * 返回系统能力/状态信息，用于前端提示"某能力暂不可用"
 */
@Injectable()
export class SystemService {
  constructor(private configService: ConfigService) {}

  /**
   * 获取系统状态
   */
  getStatus() {
    return {
      ocrProvider: this.getOcrProvider(),
      poiProvider: this.getPoiProvider(),
      asrProvider: this.getAsrProvider(),
      ttsProvider: this.getTtsProvider(),
      llmProvider: this.getLlmProvider(),
      rateLimit: {
        enabled: false,
        remaining: null,
        resetAt: null,
      },
      features: {
        vision: {
          enabled: true,
          maxFileSize: 6 * 1024 * 1024, // 6MB
          supportedFormats: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
        },
        voice: {
          enabled: true,
          asrEnabled: true,
          ttsEnabled: true,
        },
        whatIf: {
          enabled: true,
          maxSamples: 1000,
        },
      },
    };
  }

  /**
   * 获取 OCR Provider 状态
   */
  private getOcrProvider(): 'mock' | 'google' | 'unavailable' {
    const apiKey = this.configService.get<string>('GOOGLE_VISION_API_KEY');
    return apiKey ? 'google' : 'mock';
  }

  /**
   * 获取 POI Provider 状态
   */
  private getPoiProvider(): 'mock' | 'google' | 'osm' | 'unavailable' {
    const googleKey = this.configService.get<string>('GOOGLE_PLACES_API_KEY');
    if (googleKey) return 'google';
    // 可以检查 OSM 配置
    return 'mock';
  }

  /**
   * 获取 ASR Provider 状态
   */
  private getAsrProvider(): 'mock' | 'openai' | 'google' | 'azure' | 'unavailable' {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const googleKey = this.configService.get<string>('GOOGLE_SPEECH_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }

  /**
   * 获取 TTS Provider 状态
   */
  private getTtsProvider(): 'mock' | 'openai' | 'google' | 'azure' | 'unavailable' {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const googleKey = this.configService.get<string>('GOOGLE_TTS_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }

  /**
   * 获取 LLM Provider 状态
   */
  private getLlmProvider(): 'mock' | 'openai' | 'anthropic' | 'google' | 'unavailable' {
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openaiKey) return 'openai';
    const anthropicKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (anthropicKey) return 'anthropic';
    const googleKey = this.configService.get<string>('GOOGLE_AI_API_KEY');
    if (googleKey) return 'google';
    return 'mock';
  }
}
