import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
import { AssistantSuggestion } from '../../assist/dto/action.dto';
export declare class LlmVoiceParserService {
    private readonly logger;
    private readonly enabled;
    private readonly provider?;
    private readonly apiKey?;
    constructor();
    parseWithLlm(transcript: string, schedule: DayScheduleResult): Promise<AssistantSuggestion[] | null>;
    private buildPromptAndSchema;
    private callLlmApi;
    private callOpenAI;
    private callGemini;
    private callDeepSeek;
    private parseAndValidateResponse;
    private validateAndTransformSuggestion;
    private formatTime;
}
