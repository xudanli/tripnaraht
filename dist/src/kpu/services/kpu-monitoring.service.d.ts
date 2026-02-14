export interface KPUMetrics {
    totalValidations: number;
    successfulValidations: number;
    failedValidations: number;
    avgValidationLatency: number;
    avgValidationScore: number;
    totalRetrievals: number;
    avgRetrievalLatency: number;
    avgCandidatesPerRetrieval: number;
    totalGenerations: number;
    successfulGenerations: number;
    failedGenerations: number;
    avgGenerationLatency: number;
    retryCount: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    totalLlmCalls: number;
    successfulLlmCalls: number;
    failedLlmCalls: number;
    avgLlmLatency: number;
}
export declare class KPUMonitoringService {
    private readonly logger;
    private metrics;
    private validationLatencies;
    private retrievalLatencies;
    private generationLatencies;
    private validationScores;
    private llmLatencies;
    recordValidation(success: boolean, latency: number, score?: number): void;
    recordRetrieval(latency: number, candidateCount: number): void;
    recordGeneration(success: boolean, latency: number, retried?: boolean): void;
    recordCacheHit(): void;
    recordCacheMiss(): void;
    recordLlmCall(success: boolean, latency: number): void;
    getMetrics(): KPUMetrics;
    resetMetrics(): void;
    getMetricsSummary(): string;
    private updateAvgValidationLatency;
    private updateAvgRetrievalLatency;
    private updateAvgGenerationLatency;
    private updateAvgValidationScore;
    private updateCacheHitRate;
    private updateAvgLlmLatency;
}
