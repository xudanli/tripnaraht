import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPackage } from '../types/context-package.types';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
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
        cacheLevel?: 'L1' | 'L2' | 'L3' | 'none';
        skillsCalled: string[];
    };
    blockTypeDistribution: Record<string, number>;
    priorityDistribution: {
        high: number;
        medium: number;
        low: number;
    };
}
export interface ContextMetricsSummary {
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
}
export declare class ContextMetricsService {
    private readonly prisma?;
    private readonly skillsRegistry?;
    private readonly logger;
    private readonly metricsStore;
    constructor(prisma?: PrismaService, skillsRegistry?: SkillsRegistryService);
    recordMetrics(contextPackage: ContextPackage, metadata: {
        tripId?: string;
        phase: string;
        agent: string;
        buildTimeMs: number;
        cacheHit: boolean;
        cacheLevel?: 'L1' | 'L2' | 'L3' | 'none';
        skillsCalled: string[];
        usedBlockKeys?: string[];
        userQuery?: string;
    }): Promise<ContextMetricsRecord>;
    private storeMetrics;
    getMetricsSummary(options: {
        tripId?: string;
        phase?: string;
        agent?: string;
        startTime?: string;
        endTime?: string;
    }): Promise<ContextMetricsSummary>;
    getRecentMetrics(tripId?: string, limit?: number): ContextMetricsRecord[];
    getAllMetrics(options?: {
        tripId?: string;
        phase?: string;
        agent?: string;
        startTime?: string;
        endTime?: string;
    }): ContextMetricsRecord[];
    getStatsByAgent(options?: {
        startTime?: string;
        endTime?: string;
    }): Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
    getStatsByPhase(options?: {
        startTime?: string;
        endTime?: string;
    }): Record<string, {
        count: number;
        avgTokens: number;
        avgBuildTimeMs: number;
        cacheHitRate: number;
    }>;
}
