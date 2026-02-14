import { OcrProvider } from './ocr.provider.interface';
export declare class GoogleOcrProvider implements OcrProvider {
    private readonly logger;
    private readonly apiKey;
    private readonly enabled;
    constructor();
    extractText(image: Buffer, opts?: {
        locale?: string;
        mimeType?: string;
    }): Promise<{
        fullText: string;
        lines: string[];
        blocks?: Array<{
            text: string;
            confidence?: number;
        }>;
    }>;
    private mapLocaleToLanguageCode;
}
