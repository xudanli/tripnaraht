export declare enum LlmProvider {
    OPENAI = "openai",
    GEMINI = "gemini",
    DEEPSEEK = "deepseek",
    ANTHROPIC = "anthropic",
    VLLM = "vllm"
}
export declare class NaturalLanguageToParamsDto {
    text: string;
    provider?: LlmProvider;
    contextBlocks?: any[];
    destinationCode?: string;
    destinationConfig?: any;
}
export declare class TripCreationParams {
    destination: string;
    startDate: string;
    endDate: string;
    totalBudget: number;
    hasChildren?: boolean;
    hasElderly?: boolean;
    preferences?: Record<string, any>;
}
export declare class HumanizeResultDto {
    data: Record<string, any>;
    dataType: string;
    provider?: LlmProvider;
}
export declare class DecisionSupportDto {
    scenario: string;
    contextData: Record<string, any>;
    provider?: LlmProvider;
}
