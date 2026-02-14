import { LlmService } from '../../../llm/services/llm.service';
import { RedisService } from '../../../redis/redis.service';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { AIEnhancedReadinessResult, UserProfile, RiskAIEnhancements, PackingListAIEnhancements } from '../types/ai-enhanced.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessCacheService } from './readiness-cache.service';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';
export declare class ReadinessAIService {
    private readonly llmService?;
    private readonly cacheService?;
    private readonly redisService?;
    private readonly chunkRetrievalService?;
    private readonly logger;
    private readonly maxRetries;
    private readonly timeoutMs;
    constructor(llmService?: LlmService, cacheService?: ReadinessCacheService, redisService?: RedisService, chunkRetrievalService?: ChunkRetrievalService);
    enhancePersonalizedChecklist(baseResult: ReadinessCheckResult, userProfile: UserProfile, tripContext: TripContext, options?: {
        enableAI: boolean;
    }): Promise<AIEnhancedReadinessResult>;
    private enhanceWithAI;
    private inferTaskDeadlines;
    private retrieveChannels;
    private extractChannelName;
    private extractChannelUrl;
    private rankByUserProfile;
    private buildDeadlinePrompt;
    private buildRankingPrompt;
    private getDeadlineSchema;
    private getRankingSchema;
    private executeWithTimeout;
    private createTimeoutPromise;
    private extractJSON;
    enhanceRiskWarnings(baseResult: ReadinessCheckResult, userProfile: UserProfile, tripContext: TripContext, options?: {
        enableAI: boolean;
    }): Promise<RiskAIEnhancements>;
    private assessRiskSeverity;
    private generateMitigations;
    private retrieveEmergencyContacts;
    private extractEmergencyContacts;
    private buildRiskSeverityPrompt;
    private buildMitigationPrompt;
    private getRiskSeveritySchema;
    private getMitigationSchema;
    enhancePackingList(baseItems: Array<{
        id: string;
        name: string;
        category: string;
        quantity: number;
        priority: string;
    }>, userProfile: UserProfile, tripContext: TripContext, durationDays: number, options?: {
        enableAI: boolean;
    }): Promise<PackingListAIEnhancements>;
    private inferItemQuantities;
    private generateItemReasons;
    private recommendPackingItems;
    private buildQuantityPrompt;
    private buildReasonPrompt;
    private buildRecommendationPrompt;
    private getQuantitySchema;
    private getReasonSchema;
    private getRecommendationSchema;
    private toBaseResult;
}
