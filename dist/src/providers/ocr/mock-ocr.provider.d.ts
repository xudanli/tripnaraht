import { OcrProvider } from './ocr.provider.interface';
export declare class MockOcrProvider implements OcrProvider {
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
}
