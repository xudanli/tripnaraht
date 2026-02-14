import { LlmService } from '../../../../llm/services/llm.service';
import { McpToolDefinition } from './mcp-tool-registry.service';
export interface ToolSelection {
    tool: McpToolDefinition;
    confidence: number;
    extractedParams: Record<string, any>;
    reason?: string;
    reasonCN?: string;
}
export interface SessionContext {
    phase?: string;
    preferences?: Record<string, any>;
    selectedDestination?: string;
    messageHistory?: Array<{
        role: string;
        content: string;
    }>;
}
export declare class LlmToolSelectorService {
    private readonly llmService?;
    private readonly logger;
    private selectionCache;
    private readonly CACHE_TTL;
    constructor(llmService?: LlmService);
    selectTool(userMessage: string, context: SessionContext, availableTools: McpToolDefinition[]): Promise<ToolSelection>;
    private buildToolSelectionPrompt;
    private cleanJsonString;
    private buildCacheKey;
    private cleanExpiredCache;
    clearCache(): void;
}
