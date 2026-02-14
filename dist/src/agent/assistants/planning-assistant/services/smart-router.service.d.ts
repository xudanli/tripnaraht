import { LlmService } from '../../../../llm/services/llm.service';
import { McpToolRegistryService, McpToolDefinition } from './mcp-tool-registry.service';
import { LlmToolSelectorService, ToolSelection } from './llm-tool-selector.service';
export type RoutingTarget = 'recommendations' | 'generate' | 'compare' | 'hotel' | 'airbnb' | 'accommodation' | 'restaurant' | 'flight' | 'rail' | 'carRental' | 'weather' | 'search' | 'translate' | 'currency' | 'image' | 'calendar' | 'chat';
export interface RoutingResult {
    target: RoutingTarget;
    confidence: number;
    extractedParams?: {
        destination?: string;
        preferences?: Record<string, any>;
        planIds?: string[];
        naturalLanguage?: string;
        [key: string]: any;
    };
    reason?: string;
    reasonCN?: string;
}
export interface ExtractedParams {
    destination?: string;
    preferences?: {
        budget?: {
            total?: number;
            currency?: string;
        };
        travelers?: {
            adults?: number;
            children?: number;
        };
        activities?: string[];
        travelStyle?: string;
        dateRange?: {
            startDate?: string;
            endDate?: string;
        };
    };
    filters?: {
        countryCode?: string;
        region?: string;
    };
    constraints?: {
        days?: number;
        startDate?: string;
        endDate?: string;
    };
    planIds?: string[];
    [key: string]: any;
}
export declare class SmartRouterService {
    private readonly llmService?;
    private readonly toolRegistry?;
    private readonly toolSelector?;
    private readonly logger;
    constructor(llmService?: LlmService, toolRegistry?: McpToolRegistryService, toolSelector?: LlmToolSelectorService);
    routeWithTools(message: string, sessionState?: {
        phase?: string;
        preferences?: Record<string, any>;
        planCandidates?: Array<{
            id: string;
        }>;
        selectedDestination?: string;
    }): Promise<RoutingResult & {
        selectedTool?: McpToolDefinition;
        toolSelection?: ToolSelection;
    }>;
    route(message: string, sessionState?: {
        phase?: string;
        preferences?: Record<string, any>;
        planCandidates?: Array<{
            id: string;
        }>;
        selectedDestination?: string;
    }): Promise<RoutingResult>;
    private routeWithLLM;
    private routeByKeywords;
    extractParams(naturalLanguage: string, targetType: 'recommendations' | 'generate' | 'compare'): Promise<ExtractedParams>;
    private cleanJsonString;
    private buildExtractionPrompt;
    private mapTargetToServiceName;
}
