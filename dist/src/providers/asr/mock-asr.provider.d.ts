import { AsrProvider, AsrResult } from './asr.provider.interface';
export declare class MockAsrProvider implements AsrProvider {
    transcribe(audioBuffer: Buffer, options?: {
        language?: string;
        format?: string;
    }): Promise<AsrResult>;
}
