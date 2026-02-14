import { VoiceService } from './voice.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { StandardResponse } from '../common/dto/standard-response.dto';
import { AssistantSuggestion } from '../assist/dto/action.dto';
interface MulterFile {
    buffer: Buffer;
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
}
export declare class VoiceController {
    private readonly voiceService;
    constructor(voiceService: VoiceService);
    parse(body: {
        transcript: string;
        schedule: DayScheduleResult;
    }): Promise<StandardResponse<{
        suggestions: AssistantSuggestion[];
    }>>;
    transcribe(file: MulterFile | undefined, body: {
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
    speak(body: {
        text: string;
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
export {};
