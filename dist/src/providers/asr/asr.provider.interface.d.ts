export interface AsrProvider {
    transcribe(audioBuffer: Buffer, options?: {
        language?: string;
        format?: string;
    }): Promise<AsrResult>;
}
export interface AsrResult {
    transcript: string;
    words?: Array<{
        word: string;
        start: number;
        end: number;
    }>;
    language?: string;
    confidence?: number;
}
