import { LlmProvider } from '../dto/llm-request.dto';
export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}
export declare function extractTokenUsage(provider: LlmProvider, response: any, prompt: string): TokenUsage;
