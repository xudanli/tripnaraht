export declare class PlanVariantFeedbackDto {
    runId: string;
    variantId: string;
    variantStrategy: 'conservative' | 'balanced' | 'aggressive';
    userChoice: 'selected' | 'rejected' | 'modified';
    rating?: number;
    reason?: string;
    tripId?: string;
    userId?: string;
}
export declare class ConflictFeedbackDto {
    runId: string;
    conflictId: string;
    conflictType: string;
    understood: boolean;
    explanationClear: boolean;
    tradeoffOptionsUseful: boolean;
    selectedTradeoffOption?: string;
    tripId?: string;
    userId?: string;
}
export declare class DecisionQualityFeedbackDto {
    runId: string;
    overallSatisfaction: number;
    planQuality: number;
    conflictExplanationQuality?: number;
    tradeoffOptionsQuality?: number;
    decisionSpeed?: number;
    additionalFeedback?: string;
    tripId?: string;
    userId?: string;
}
export declare class BatchFeedbackDto {
    planVariantFeedbacks?: PlanVariantFeedbackDto[];
    conflictFeedbacks?: ConflictFeedbackDto[];
    decisionQualityFeedbacks?: DecisionQualityFeedbackDto[];
}
export declare class FeedbackStatsQueryDto {
    userId?: string;
    tripId?: string;
    startDate?: string;
    endDate?: string;
}
