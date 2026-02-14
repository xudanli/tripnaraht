import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from '../dto/llm-request.dto';
export declare enum RoutingStrategy {
    VLLM_FIRST = "vllm_first",
    API_FIRST = "api_first",
    AUTO = "auto",
    FIXED = "fixed"
}
export declare enum TaskComplexity {
    SIMPLE = "simple",
    MEDIUM = "medium",
    COMPLEX = "complex"
}
export interface RoutingDecision {
    provider: LlmProvider;
    model: string;
    loraAdapter?: string;
    reason: string;
    fallbackProvider?: LlmProvider;
}
export interface RoutingRequest {
    taskType: string;
    complexity?: TaskComplexity;
    inputLength?: number;
    structuredOutput?: boolean;
    functionCalling?: boolean;
    preferredProvider?: LlmProvider;
    maxLatencyMs?: number;
    maxCostCents?: number;
}
interface ModelInfo {
    provider: LlmProvider;
    model: string;
    costPer1kTokens: number;
    avgLatencyMs: number;
    maxContextLength: number;
    supportsFunctionCalling: boolean;
    supportsStructuredOutput: boolean;
    reasoningScore: number;
    available: boolean;
}
export declare class ModelRouterService implements OnModuleInit {
    private readonly configService;
    private readonly logger;
    private strategy;
    private fixedProvider;
    private vllmAvailable;
    private readonly modelInfoMap;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    private initModelInfo;
    private parseStrategy;
    private parseProvider;
    private checkVllmAvailability;
    route(request: RoutingRequest): Promise<RoutingDecision>;
    private routeVllmFirst;
    private routeApiFirst;
    private routeAuto;
    private inferComplexity;
    private createDecision;
    getModelInfo(provider: LlmProvider): ModelInfo | undefined;
    getAvailableModels(): ModelInfo[];
    setVllmAvailable(available: boolean): void;
    getStrategy(): RoutingStrategy;
    setStrategy(strategy: RoutingStrategy): void;
}
export {};
