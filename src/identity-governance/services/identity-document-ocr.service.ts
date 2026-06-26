import { Injectable, Logger } from '@nestjs/common';
import { MockOcrProvider } from '../../providers/ocr/mock-ocr.provider';
import { GoogleOcrProvider } from '../../providers/ocr/google-ocr.provider';
import { DeepSeekOcrProvider } from '../../providers/ocr/deepseek-ocr.provider';

@Injectable()
export class IdentityDocumentOcrService {
  private readonly logger = new Logger(IdentityDocumentOcrService.name);
  private readonly mock = new MockOcrProvider();
  private readonly google = new GoogleOcrProvider();
  private readonly deepseek = new DeepSeekOcrProvider();

  async extractText(
    buffer: Buffer,
    opts?: { locale?: string; mimeType?: string },
  ): Promise<{ fullText: string; lines: string[]; provider: string }> {
    const useDeepSeek =
      !!(process.env.DEEPSEEK_OCR_API_KEY || process.env.DEEPSEEK_API_KEY) &&
      process.env.IDENTITY_DOC_OCR_PROVIDER !== 'mock';
    const useGoogle = !!process.env.GOOGLE_VISION_API_KEY && process.env.IDENTITY_DOC_OCR_PROVIDER === 'google';

    const providers: Array<{ name: string; run: () => Promise<{ fullText: string; lines: string[] }> }> = [];

    if (useDeepSeek) {
      providers.push({
        name: 'deepseek',
        run: () => this.deepseek.extractText(buffer, opts),
      });
    }
    if (useGoogle) {
      providers.push({
        name: 'google',
        run: () => this.google.extractText(buffer, opts),
      });
    }
    providers.push({
      name: 'mock',
      run: () => this.mock.extractText(buffer, { ...opts, locale: opts?.locale ?? 'zh-CN' }),
    });

    for (const provider of providers) {
      try {
        const result = await provider.run();
        return { ...result, provider: provider.name };
      } catch (error) {
        this.logger.warn(`OCR provider ${provider.name} failed: ${error}`);
      }
    }

    throw new Error('所有 OCR 提供者均不可用');
  }
}
