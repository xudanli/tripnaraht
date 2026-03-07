// src/providers/ocr/deepseek-ocr.provider.ts

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import { OcrProvider } from './ocr.provider.interface';

/**
 * DeepSeek-OCR 提供者
 *
 * 使用 DeepSeek-OCR API (api.deepsee-ocr.ai) 进行文字识别
 * 需配置 DEEPSEEK_OCR_API_KEY；若未配置可复用 DEEPSEEK_API_KEY（部分场景通用）
 *
 * 文档: https://www.deepseek-ocr.ai/docs
 */
@Injectable()
export class DeepSeekOcrProvider implements OcrProvider {
  private readonly logger = new Logger(DeepSeekOcrProvider.name);
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey =
      process.env.DEEPSEEK_OCR_API_KEY || process.env.DEEPSEEK_API_KEY;
    this.baseUrl =
      process.env.DEEPSEEK_OCR_API_URL || 'https://api.deepsee-ocr.ai';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      this.logger.warn(
        'DeepSeekOcrProvider: DEEPSEEK_OCR_API_KEY or DEEPSEEK_API_KEY not set, provider disabled'
      );
    }
  }

  async extractText(
    image: Buffer,
    opts?: { locale?: string; mimeType?: string }
  ): Promise<{
    fullText: string;
    lines: string[];
    blocks?: Array<{ text: string; confidence?: number }>;
  }> {
    if (!this.enabled) {
      throw new Error('DeepSeekOcrProvider is not enabled (missing API key)');
    }

    try {
      const form = new FormData();
      const ext = opts?.mimeType?.includes('png') ? 'png' : 'jpg';
      form.append('file', image, {
        filename: `image.${ext}`,
        contentType: opts?.mimeType || `image/${ext}`,
      });

      if (opts?.locale) {
        const lang = this.mapLocaleToIso(opts.locale);
        if (lang) form.append('language', lang);
      }

      form.append(
        'prompt',
        'Extract all text from this image. Preserve line breaks. Output plain text only.'
      );

      const response = await axios.post(`${this.baseUrl}/v1/ocr`, form, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...form.getHeaders(),
        },
        timeout: 30000,
        proxy: false, // 直连 API，不走本地代理（避免 127.0.0.1:9090 未启动时 ECONNREFUSED）
      });

      const data = response.data as { text?: string };
      const fullText = data.text || '';
      const lines = fullText
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

      return {
        fullText,
        lines,
        blocks: lines.map((text) => ({ text, confidence: 0.95 })),
      };
    } catch (error: any) {
      this.logger.error(`DeepSeek OCR error: ${error.message}`, error.stack);
      throw error;
    }
  }

  private mapLocaleToIso(locale: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh',
      'ja-JP': 'ja',
      'ko-KR': 'ko',
      'en-US': 'en',
      'en-GB': 'en',
    };
    return mapping[locale] || locale.split('-')[0] || '';
  }
}
