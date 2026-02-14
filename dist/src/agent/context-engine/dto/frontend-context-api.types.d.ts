export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
}
export interface GetContextMetricsResponse {
    summary: {
        timeRange: {
            start: string;
            end: string;
        };
        totalRecords: number;
        avgTokens: number;
        avgCompressionRate: number;
        avgHitRate?: number;
        avgNoiseRate: number;
        cacheHitRate: number;
        avgBuildTimeMs: number;
        qualityDistribution: {
            EXCELLENT: number;
            GOOD: number;
            FAIR: number;
            POOR: number;
        };
        topBlockTypes: Array<{
            type: string;
            count: number;
        }>;
    };
    byAgent: Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
    byPhase: Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
}
export interface ContextPackageListItem {
    id: string;
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    blocksCount: number;
    totalTokens: number;
    tokenBudget: number;
    compressed: boolean;
    createdAt: string;
}
export interface GetContextPackagesResponse {
    packages: ContextPackageListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface ContextBlock {
    key: string;
    type: string;
    text: string;
    data?: Record<string, any>;
    priority: number;
    visibility: 'public' | 'private';
    provenance: {
        source: string;
        identifier: string;
        version?: string;
        timestamp: string;
    };
    estimatedTokens?: number;
}
export interface ContextPackage {
    id: string;
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    blocks: ContextBlock[];
    totalTokens: number;
    tokenBudget: number;
    compressed: boolean;
    createdAt: string;
    metadata?: Record<string, any>;
}
export interface ContextMetricsRecord {
    id: string;
    tripId?: string;
    phase: string;
    agent: string;
    timestamp: string;
    tokens: {
        total: number;
        budget: number;
        overBudget: boolean;
        overBudgetRate: number;
    };
    blocks: {
        total: number;
        public: number;
        private: number;
        compressed: boolean;
        compressionRate?: number;
    };
    quality: {
        hitRate?: number;
        noiseRate: number;
        relevanceScore?: number;
        quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    };
    performance: {
        buildTimeMs: number;
        cacheHit: boolean;
        skillsCalled: string[];
    };
    blockTypeDistribution: Record<string, number>;
    priorityDistribution: {
        high: number;
        medium: number;
        low: number;
    };
}
export interface GetContextPackageDetailResponse {
    package: ContextPackage;
    metrics?: ContextMetricsRecord;
}
export interface TokenUsageTrendPoint {
    timestamp: string;
    avgTokens: number;
    maxTokens: number;
    minTokens: number;
    count: number;
}
export interface GetContextAnalyticsResponse {
    tokenUsageTrend: TokenUsageTrendPoint[];
    cacheHitRateTrend: Array<{
        timestamp: string;
        cacheHitRate: number;
        count: number;
    }>;
    compressionAnalysis: {
        avgCompressionRate: number;
        compressionRateDistribution: Array<{
            range: string;
            count: number;
        }>;
    };
    qualityAnalysis: {
        distribution: Record<string, number>;
        trend: Array<{
            timestamp: string;
            excellent: number;
            good: number;
            fair: number;
            poor: number;
        }>;
    };
    topBlockTypes: Array<{
        type: string;
        avgTokens: number;
        count: number;
    }>;
    performanceBottlenecks: Array<{
        agent: string;
        phase: string;
        avgBuildTimeMs: number;
        count: number;
    }>;
}
export interface GetContextMetricsQuery {
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
}
export interface GetContextPackagesQuery {
    page?: number;
    limit?: number;
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
    search?: string;
}
export interface GetContextAnalyticsQuery {
    startTime?: string;
    endTime?: string;
    granularity?: 'hour' | 'day' | 'week' | 'month';
}
