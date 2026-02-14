import { LlmProvider } from '../../llm/dto/llm-request.dto';
export declare class CreateTripFromNaturalLanguageDto {
    text: string;
    sessionId?: string;
    isNewConversation?: boolean;
    llmProvider?: LlmProvider;
}
