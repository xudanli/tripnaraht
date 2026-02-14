import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
export interface PlanVariantFeedback {
    feedbackId: string;
    tripId?: string;
    userId?: string;
    runId: string;
    variantId: string;
    variantStrategy: 'conservative' | 'balanced' | 'aggressive';
    userChoice: 'selected' | 'rejected' | 'modified';
    rating?: number;
    reason?: string;
    feedbackAt: Date;
}
export interface ConflictFeedback {
    feedbackId: string;
    tripId?: string;
    userId?: string;
    runId: string;
    conflictId: string;
    conflictType: string;
    understood: boolean;
    explanationClear: boolean;
    tradeoffOptionsUseful: boolean;
    selectedTradeoffOption?: string;
    feedbackAt: Date;
}
export interface DecisionQualityFeedback {
    feedbackId: string;
    tripId?: string;
    userId?: string;
    runId: string;
    overallSatisfaction: number;
    planQuality: number;
    conflictExplanationQuality?: number;
    tradeoffOptionsQuality?: number;
    decisionSpeed?: number;
    additionalFeedback?: string;
    feedbackAt: Date;
}
export declare class FeedbackCollectorService {
    private readonly prisma;
    private readonly moduleRef;
    private readonly logger;
    private contextLearningService?;
    constructor(prisma: PrismaService, moduleRef: ModuleRef);
    collectPlanVariantFeedback(feedback: PlanVariantFeedback): Promise<void>;
    collectConflictFeedback(feedback: ConflictFeedback): Promise<void>;
    collectDecisionQualityFeedback(feedback: DecisionQualityFeedback): Promise<void>;
    collectBatchFeedback(planVariantFeedbacks?: PlanVariantFeedback[], conflictFeedbacks?: ConflictFeedback[], decisionQualityFeedbacks?: DecisionQualityFeedback[]): Promise<void>;
    getFeedbackStats(userId?: string, tripId?: string, startDate?: Date, endDate?: Date): Promise<{
        planVariantCount: number;
        conflictCount: number;
        decisionQualityCount: number;
        averageSatisfaction: number;
        averagePlanQuality: number;
    }>;
    private recordUserFeedbackEvent;
}
