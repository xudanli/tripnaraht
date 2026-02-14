export declare class PromptService {
    private readonly logger;
    private readonly promptCache;
    private readonly handlebars;
    constructor();
    private registerHelpers;
    getPrompt(promptType: 'intent_analysis' | 'qa_enhancement' | 'general_chat', version?: string): Promise<string>;
    renderPrompt(promptType: 'intent_analysis' | 'qa_enhancement' | 'general_chat', variables: Record<string, any>, version?: string): Promise<string>;
    private getPromptFilePath;
    private extractPromptContent;
    clearCache(): void;
    getCacheStats(): {
        size: number;
        keys: string[];
    };
}
