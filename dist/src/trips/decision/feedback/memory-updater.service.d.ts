import { DecisionRunLog } from '../decision-log';
import { LearningService } from '../learning/learning.service';
import { PlanVariantFeedback, ConflictFeedback, DecisionQualityFeedback } from './feedback-collector.service';
import { QualityAssessmentResult } from './quality-assessor.service';
export interface MemoryUpdateResult {
    success: boolean;
    updatedMemoryTypes: string[];
    updatedParameters: Record<string, any>;
    reason: string;
    updatedAt: Date;
}
export declare class MemoryUpdaterService {
    private readonly learningService?;
    private readonly logger;
    constructor(learningService?: LearningService);
    updateMemoryFromFeedback(log: DecisionRunLog, qualityAssessment: QualityAssessmentResult, feedbacks?: {
        planVariantFeedbacks?: PlanVariantFeedback[];
        conflictFeedbacks?: ConflictFeedback[];
        decisionQualityFeedback?: DecisionQualityFeedback;
    }): Promise<MemoryUpdateResult>;
    batchUpdateMemory(logs: DecisionRunLog[], qualityAssessments: QualityAssessmentResult[], feedbacksArray: Array<{
        planVariantFeedbacks?: PlanVariantFeedback[];
        conflictFeedbacks?: ConflictFeedback[];
        decisionQualityFeedback?: DecisionQualityFeedback;
    }>): Promise<MemoryUpdateResult[]>;
}
