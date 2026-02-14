import { TtsProvider, TtsResult } from './tts.provider.interface';
export declare class MockTtsProvider implements TtsProvider {
    speak(text: string, options?: {
        locale?: string;
        voice?: string;
        format?: 'mp3' | 'wav' | 'ogg';
    }): Promise<TtsResult>;
}
