import { LlmProvider } from '../../llm/dto/llm-request.dto';
export declare class CreateTripFromNLDto {
    text: string;
    sessionId?: string;
    llmProvider?: LlmProvider;
}
export declare class GetConversationContextDto {
    sessionId: string;
}
export declare class UpdateConversationContextDto {
    sessionId: string;
    conversationContext?: Record<string, any>;
    partialParams?: Record<string, any>;
}
export declare class DeleteConversationDto {
    sessionId: string;
}
