// src/providers/ocr/google-ocr.provider.ts

import { Injectable, Logger } from '@nestjs/common';
import { OcrProvider } from './ocr.provider.interface';

/**
 * Google Vision API OCR 提供者
 * 
 * 使用 Google Cloud Vision API 进行 OCR 文字识别
 */
@Injectable()
export class GoogleOcrProvider implements OcrProvider {
  private readonly logger = new Logger(GoogleOcrProvider.name);
  private readonly apiKey: string | undefined;
  private readonly enabled: boolean;

  constructor() {
    this.apiKey = process.env.GOOGLE_VISION_API_KEY;
    this.enabled = !!this.apiKey;
    
    if (!this.enabled) {
      this.logger.warn('GoogleOcrProvider: GOOGLE_VISION_API_KEY not set, provider disabled');
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
      throw new Error('GoogleOcrProvider is not enabled (missing API key)');
    }

    try {
      // 将图片转换为 base64
      const base64Image = image.toString('base64');

      // 调用 Google Vision API
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  content: base64Image,
                },
                features: [
                  {
                    type: 'TEXT_DETECTION',
                    maxResults: 1,
                  },
                ],
                imageContext: {
                  languageHints: opts?.locale ? [this.mapLocaleToLanguageCode(opts.locale)] : undefined,
                },
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Vision API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      
      const responseData = data as any;
      if (responseData.responses && responseData.responses[0] && responseData.responses[0].textAnnotations) {
        const annotations = responseData.responses[0].textAnnotations;
        
        // 第一个 annotation 是完整文本
        const fullText = annotations[0]?.description || '';
        
        // 其他 annotations 是文本块（带位置信息）
        const blocks = annotations.slice(1).map((ann: any) => ({
          text: ann.description || '',
          confidence: ann.confidence,
        }));

        // 按行分割
        const lines = fullText.split('\n').filter((line) => line.trim().length > 0);

        return {
          fullText,
          lines,
          blocks,
        };
      }

      // 没有检测到文字
      return {
        fullText: '',
        lines: [],
        blocks: [],
      };
    } catch (error: any) {
      this.logger.error(`Google OCR error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 将 locale 代码映射到 Google Vision API 支持的语言代码
   */
  private mapLocaleToLanguageCode(locale: string): string {
    const mapping: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh-TW',
      'ja-JP': 'ja',
      'ko-KR': 'ko',
      'en-US': 'en',
      'en-GB': 'en',
    };

    return mapping[locale] || locale.split('-')[0] || 'en';
  }
}
