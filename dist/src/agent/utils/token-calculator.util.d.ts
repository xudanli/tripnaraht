export declare class TokenCalculator {
    static estimateTokens(text: string | null | undefined): number;
    static estimateJsonTokens(obj: any): number;
    static estimateMessagesTokens(messages: Array<{
        role?: string;
        content?: string;
    }>): number;
    static estimateStateTokens(state: any): number;
    static estimateTotalTokens(requestText: string | null | undefined, responseText: string | null | undefined, additionalData?: any): number;
}
