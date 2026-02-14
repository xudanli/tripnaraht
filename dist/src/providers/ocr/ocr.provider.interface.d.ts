export interface OcrProvider {
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
