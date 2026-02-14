export interface TtsProvider {
    speak(text: string, options?: {
        locale?: string;
        voice?: string;
        format?: 'mp3' | 'wav' | 'ogg';
    }): Promise<TtsResult>;
}
export interface TtsResult {
    audioBuffer?: Buffer;
    audioUrl?: string;
    format: 'mp3' | 'wav' | 'ogg';
    duration?: number;
}
