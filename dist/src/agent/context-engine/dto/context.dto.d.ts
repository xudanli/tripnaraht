import { ContextPackage, ContextBlock, ApiDocCategory } from '../types/context-package.types';
import { StateProjection } from '../types/trip-state-projection.types';
import { ContextMetricsSummary, ContextMetricsRecord } from '../services/context-metrics.service';
export declare class BuildContextPackageDto {
    tripId?: string;
    phase: string;
    agent: string;
    userQuery: string;
    tokenBudget?: number;
    includePrivate?: boolean;
    requiredTopics?: string[];
    excludeTopics?: string[];
    useCache?: boolean;
    includeApiDocs?: boolean;
    apiDocCategories?: ApiDocCategory[];
}
export declare class BuildContextPackageResponseDto {
    contextPackage: ContextPackage;
}
export declare class CompressContextDto {
    blocks: ContextBlock[];
    tokenBudget: number;
    strategy?: 'aggressive' | 'conservative' | 'balanced';
    preserveKeys?: string[];
}
export declare class CompressContextResponseDto {
    compressedBlocks: ContextBlock[];
    stats: {
        originalBlocks: number;
        compressedBlocks: number;
        originalTokens: number;
        compressedTokens: number;
        reductionRatio: number;
        removedKeys: string[];
    };
}
export declare class ProjectStateDto {
    state: any;
    includeFullState?: boolean;
    decisionLogLimit?: number;
    rejectionLogLimit?: number;
    tokenBudget?: number;
}
export declare class ProjectStateResponseDto {
    projection: StateProjection;
}
export declare class WriteBackDto {
    tripRunId: string;
    attemptNumber: number;
    scratchpad: {
        planOutline?: string;
        openQuestions?: string[];
        constraintsAssumed?: string[];
        nextActions?: string[];
        failureNotes?: string;
    };
    decisionLogDelta?: any[];
    artifactsRefs?: Record<string, string>;
}
export declare class GetMetricsQueryDto {
    tripId?: string;
    phase?: string;
    agent?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
}
export declare class GetMetricsResponseDto {
    summary: ContextMetricsSummary;
    recent?: ContextMetricsRecord[];
}
