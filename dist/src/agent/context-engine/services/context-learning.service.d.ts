import { PrismaService } from '../../../prisma/prisma.service';
import { ContextPackage } from '../types/context-package.types';
import { ParallelExecutorService } from '../../../rag/services/parallel-executor.service';
import { ContextPrometheusMetricsService } from './context-prometheus-metrics.service';
export type ContextLearningEventType = 'context_built' | 'context_used' | 'decision_made' | 'user_feedback';
export interface ContextLearningInput {
    userId?: string;
    tripId?: string;
    eventType: ContextLearningEventType;
    eventData: {
        contextPackage?: ContextPackage;
        usedBlocks?: string[];
        decisionResult?: {
            accepted: boolean;
            satisfaction?: number;
        };
        feedback?: {
            relevantBlocks?: string[];
            irrelevantBlocks?: string[];
            missingBlocks?: string[];
        };
    };
    phase?: string;
    agent?: string;
    userQuery?: string;
}
export interface ContextLearningOutput {
    learningResult: {
        updatedPriorities?: Record<string, number>;
        recommendedBlocks?: string[];
        confidence: number;
        sampleSize: number;
    };
}
export interface BlockLearningStats {
    blockKey: string;
    blockType: string;
    importanceScore: number;
    relevanceScore?: number;
    usageCount: number;
    positiveFeedbackCount: number;
    negativeFeedbackCount: number;
    confidence: number;
    sampleSize: number;
}
export declare class ContextLearningService {
    private readonly prisma?;
    private readonly parallelExecutor?;
    private readonly metrics?;
    private readonly logger;
    private readonly learningWeights;
    private readonly decayFactor;
    private readonly learningResultCache;
    private readonly cacheTtl;
    constructor(prisma?: PrismaService, parallelExecutor?: ParallelExecutorService, metrics?: ContextPrometheusMetricsService);
    learn(input: ContextLearningInput): Promise<ContextLearningOutput>;
    private learnFromContextBuilt;
    private learnFromContextUsed;
    private learnFromDecisionMade;
    private learnFromUserFeedback;
    private updateBlockImportance;
    private updateBlockUsage;
    private updateBlockFeedback;
    getLearningResult(userId?: string, phase?: string, agent?: string): Promise<{
        updatedPriorities?: Record<string, number>;
        recommendedBlocks?: string[];
        confidence: number;
        sampleSize: number;
    }>;
    batchLearn(events: ContextLearningInput[], options?: {
        batchSize?: number;
        maxConcurrency?: number;
    }): Promise<ContextLearningOutput[]>;
    private cleanExpiredCache;
    getBlockLearningStats(blockKey: string, userId?: string, phase?: string, agent?: string): Promise<BlockLearningStats | null>;
}
