export declare class LangGraphQueryDto {
    query: string;
    context?: Record<string, any>;
}
export declare class LangGraphQueryResponseDto {
    finalResponse: string;
    allowed: boolean;
    coreToolOutput: any;
    extractedParams?: any;
    error?: string;
}
