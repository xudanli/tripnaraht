import { LLMCallTokenData, SubAgentTokenStats, TaskTypeTokenStats, TimeSeriesTokenStats, ProviderTokenStats, TokenStatsFilters } from '../interfaces/token-stats.interface';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SubAgentType } from '../interfaces/trip-plan.interface';
export declare class TokenStatsService {
    private readonly logger;
    private tokenRecords;
    private statsCache;
    private readonly maxRecordsInMemory;
    private readonly cacheTTL;
    recordTokenUsage(data: LLMCallTokenData): Promise<void>;
    private updateStatsCache;
    private updateSubAgentStats;
    private updateTaskTypeStats;
    private updateProviderStats;
    getSubAgentStats(subAgent: SubAgentType, timeRange?: {
        start: Date;
        end: Date;
    }): Promise<SubAgentTokenStats | null>;
    getTaskTypeStats(taskType: string, timeRange?: {
        start: Date;
        end: Date;
    }): Promise<TaskTypeTokenStats | null>;
    getTimeSeriesStats(granularity: 'hour' | 'day' | 'week' | 'month', timeRange: {
        start: Date;
        end: Date;
    }): Promise<TimeSeriesTokenStats[]>;
    getProviderStats(provider: LlmProvider, timeRange?: {
        start: Date;
        end: Date;
    }): Promise<ProviderTokenStats | null>;
    exportStats(format: 'json' | 'csv', filters?: TokenStatsFilters): Promise<string>;
    getAllRecords(): LLMCallTokenData[];
    clearStats(): void;
}
