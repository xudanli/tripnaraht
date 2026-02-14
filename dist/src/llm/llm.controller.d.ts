import { LlmService } from './services/llm.service';
import { NaturalLanguageToParamsDto, HumanizeResultDto, DecisionSupportDto, LlmProvider } from './dto/llm-request.dto';
import { TokenStatsService } from '../agent/services/token-stats.service';
import { LlmCostService } from './services/llm-cost.service';
import { PythonAIService } from './services/python-ai.service';
export declare class LlmController {
    private readonly llmService;
    private readonly tokenStatsService;
    private readonly llmCostService;
    private readonly pythonAIService?;
    constructor(llmService: LlmService, tokenStatsService: TokenStatsService, llmCostService: LlmCostService, pythonAIService?: PythonAIService);
    naturalLanguageToParams(dto: NaturalLanguageToParamsDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    humanizeResult(dto: HumanizeResultDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    decisionSupport(dto: DecisionSupportDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getModels(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getUsage(subAgent?: string, provider?: LlmProvider, startTime?: string, endTime?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCost(subAgent?: string, provider?: LlmProvider, startTime?: string, endTime?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPythonAIStatus(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
