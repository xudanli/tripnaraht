import { RedisService } from '../../redis/redis.service';
import { SnippetValidationResult, OutputValidationResult } from '../types/validation.types';
import { KPUMonitoringService } from './kpu-monitoring.service';
export declare class ValidationCacheService {
    private readonly redisService?;
    private readonly monitoringService?;
    private readonly logger;
    private readonly TTL;
    private readonly memoryCache;
    constructor(redisService?: RedisService, monitoringService?: KPUMonitoringService);
    private hashContent;
    getCachedSnippetValidation(content: string): Promise<SnippetValidationResult | null>;
    cacheSnippetValidation(content: string, result: SnippetValidationResult): Promise<void>;
    getCachedOutputValidation(output: string): Promise<OutputValidationResult | null>;
    cacheOutputValidation(output: string, result: OutputValidationResult): Promise<void>;
    private cleanExpiredMemoryCache;
    clearCache(): Promise<void>;
}
