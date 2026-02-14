import { PrismaService } from '../../prisma/prisma.service';
export interface RAGPerformanceMetrics {
    retrievalLatency: {
        p50: number;
        p95: number;
        p99: number;
        avg: number;
        count: number;
    };
    embeddingLatency: {
        p50: number;
        p95: number;
        p99: number;
        avg: number;
        count: number;
    };
    throughput: {
        qps: number;
        totalRequests: number;
        timeWindow: number;
    };
    errorRate: {
        totalErrors: number;
        totalRequests: number;
        rate: number;
    };
}
export interface RAGQualityMetrics {
    recallAtK: {
        k1: number;
        k5: number;
        k10: number;
        count: number;
    };
    mrr: {
        value: number;
        count: number;
    };
    ndcgAtK: {
        k1: number;
        k5: number;
        k10: number;
        count: number;
    };
}
export interface RAGCostMetrics {
    embeddingCost: {
        totalCalls: number;
        totalTokens: number;
        estimatedCost: number;
        cachedCalls: number;
    };
    llmCost: {
        totalCalls: number;
        totalTokens: number;
        estimatedCost: number;
    };
}
export interface RAGCacheMetrics {
    embeddingCache: {
        hits: number;
        misses: number;
        hitRate: number;
        size: number;
    };
}
export interface RAGMetrics {
    performance: RAGPerformanceMetrics;
    quality: RAGQualityMetrics;
    cost: RAGCostMetrics;
    cache: RAGCacheMetrics;
    timestamp: Date;
}
export interface RetrievalEvent {
    query: string;
    latency: number;
    embeddingLatency?: number;
    resultCount: number;
    error?: string;
    useHybridSearch?: boolean;
    useReranking?: boolean;
    cacheHit?: boolean;
}
export interface QualityEvent {
    query: string;
    retrievedIds: string[];
    groundTruthIds: string[];
    k?: number;
}
export declare class RAGMonitoringService {
    private readonly prisma;
    private readonly logger;
    private readonly retrievalLatencies;
    private readonly embeddingLatencies;
    private readonly errors;
    private readonly qualityEvents;
    private embeddingCalls;
    private embeddingTokens;
    private embeddingCachedCalls;
    private llmCalls;
    private llmTokens;
    private cacheHits;
    private cacheMisses;
    private readonly MAX_SAMPLES;
    private readonly WINDOW_SIZE_MS;
    constructor(prisma: PrismaService);
    recordRetrieval(event: RetrievalEvent): void;
    recordQuality(event: QualityEvent): void;
    recordEmbeddingCall(tokens: number, cached?: boolean): void;
    recordLLMCall(tokens: number): void;
    recordCacheStats(hits: number, misses: number): void;
    getPerformanceMetrics(): RAGPerformanceMetrics;
    getQualityMetrics(): RAGQualityMetrics;
    getCostMetrics(): RAGCostMetrics;
    getCacheMetrics(): RAGCacheMetrics;
    getAllMetrics(): RAGMetrics;
    resetMetrics(): void;
    private calculatePercentiles;
    private calculateRecallAtK;
    private calculateMRR;
    private calculateNDCGAtK;
    private saveToQueryHistory;
}
