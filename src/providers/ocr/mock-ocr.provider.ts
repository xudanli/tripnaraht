// src/providers/ocr/mock-ocr.provider.ts

import { Injectable } from '@nestjs/common';
import { OcrProvider } from './ocr.provider.interface';

/**
 * Mock OCR 提供者（用于开发和测试）
 * 
 * 返回固定的 OCR 结果，不进行实际的 OCR 调用
 */
@Injectable()
export class MockOcrProvider implements OcrProvider {
  async extractText(
    image: Buffer,
    opts?: { locale?: string; mimeType?: string }
  ): Promise<{
    fullText: string;
    lines: string[];
    blocks?: Array<{ text: string; confidence?: number }>;
  }> {
    // Mock 数据：根据 locale 返回不同语言的示例文本
    const locale = opts?.locale || 'zh-CN';
    
    const mockTexts: Record<string, { fullText: string; lines: string[] }> = {
      'zh-CN': {
        fullText: '东京塔\n营业时间：9:00-22:00\n地址：港区芝公园4-2-8',
        lines: ['东京塔', '营业时间：9:00-22:00', '地址：港区芝公园4-2-8'],
      },
      'ja-JP': {
        fullText: '東京タワー\n営業時間：9:00-22:00\n住所：港区芝公園4-2-8',
        lines: ['東京タワー', '営業時間：9:00-22:00', '住所：港区芝公園4-2-8'],
      },
      'en-US': {
        fullText: 'Tokyo Tower\nHours: 9:00 AM - 10:00 PM\nAddress: 4-2-8 Shibakoen, Minato City',
        lines: ['Tokyo Tower', 'Hours: 9:00 AM - 10:00 PM', 'Address: 4-2-8 Shibakoen, Minato City'],
      },
    };

    const mock = mockTexts[locale] || mockTexts['en-US'];

    return {
      fullText: mock.fullText,
      lines: mock.lines,
      blocks: mock.lines.map((text, i) => ({
        text,
        confidence: 0.9 - i * 0.05, // 模拟置信度递减
      })),
    };
  }
}
