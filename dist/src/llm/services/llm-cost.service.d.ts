import { TokenStatsService } from '../../agent/services/token-stats.service';
import { LlmProvider } from '../dto/llm-request.dto';
import { SubAgentType } from '../../agent/interfaces/trip-plan.interface';
export declare class LlmCostService {
    private readonly tokenStatsService;
    private readonly logger;
    constructor(tokenStatsService: TokenStatsService);
    private getPricingConfig;
    calculateCost(provider: LlmProvider, model: string, promptTokens: number, completionTokens: number): number;
    getCostStats(options: {
        subAgent?: SubAgentType;
        provider?: LlmProvider;
        timeRange?: {
            start: Date;
            end: Date;
        };
    }): Promise<{
        totalCost: number;
        currency: string;
        byProvider?: Record<string, number>;
        bySubAgent?: Record<string, number>;
        timeRange?: {
            start: string;
            end: string;
        };
        breakdown: Array<{
            provider: string;
            model: string;
            calls: number;
            tokens: number;
            cost: number;
        }>;
    }>;
}
