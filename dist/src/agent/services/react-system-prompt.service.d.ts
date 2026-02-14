import { ActionRegistryService } from './action-registry.service';
export interface ToolSchema {
    name: string;
    description: string;
    inputSchema: any;
}
export declare class ReactSystemPromptService {
    private readonly actionRegistry;
    private readonly logger;
    constructor(actionRegistry: ActionRegistryService);
    generateSystemPrompt(options?: {
        currentTime?: string;
        includeToolSchemas?: boolean;
        customInstructions?: string;
    }): string;
    private generateToolSchemasSection;
    generateCompactPrompt(options?: {
        currentTime?: string;
        customInstructions?: string;
    }): string;
    generatePromptForScenario(scenario: 'planning' | 'approval' | 'execution', options?: {
        currentTime?: string;
        includeToolSchemas?: boolean;
    }): string;
}
