import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { AssistantSuggestion } from '../assist/dto/action.dto';
import { StandardResponse } from '../common/dto/standard-response.dto';
import { LlmVoiceParserService } from './services/llm-voice-parser.service';
import { AsrProvider } from '../providers/asr/asr.provider.interface';
import { TtsProvider } from '../providers/tts/tts.provider.interface';
export declare class VoiceService {
    private readonly llmParser?;
    private readonly asrProvider?;
    private readonly ttsProvider?;
    private readonly logger;
    constructor(llmParser?: LlmVoiceParserService, asrProvider?: AsrProvider, ttsProvider?: TtsProvider);
    parseTranscript(transcript: string, schedule: DayScheduleResult): Promise<StandardResponse<{
        suggestions: AssistantSuggestion[];
    }>>;
    private isQueryNextStop;
    private isMoveToMorning;
    private extractPoiName;
    private getAvailablePois;
    private findNextStop;
    private formatTime;
    transcribe(audioBuffer: Buffer, options?: {
        language?: string;
        format?: string;
    }): Promise<StandardResponse<{
        transcript: string;
        words?: Array<{
            word: string;
            start: number;
            end: number;
        }>;
        language?: string;
        confidence?: number;
    }>>;
    speak(text: string, options?: {
        locale?: string;
        voice?: string;
        format?: 'mp3' | 'wav' | 'ogg';
    }): Promise<StandardResponse<{
        audioBuffer?: Buffer;
        audioUrl?: string;
        format: 'mp3' | 'wav' | 'ogg';
        duration?: number;
    }>>;
}
