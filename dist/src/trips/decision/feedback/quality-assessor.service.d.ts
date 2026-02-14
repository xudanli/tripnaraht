import { DecisionRunLog } from '../decision-log';
import { ConstraintConflict } from '../constraints/constraint-dsl.types';
import { TripPlan } from '../plan-model';
import { PlanVariantFeedback, ConflictFeedback, DecisionQualityFeedback } from './feedback-collector.service';
export interface DecisionQualityMetrics {
    planQualityScore: number;
    conflictExplanationQualityScore: number;
    tradeoffOptionsQualityScore: number;
    decisionSpeedScore: number;
    userSatisfactionScore: number;
    overallQualityScore: number;
}
export interface QualityAssessmentResult {
    metrics: DecisionQualityMetrics;
    qualityGrade: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    improvementSuggestions: string[];
    assessedAt: Date;
}
export declare class QualityAssessorService {
    private readonly logger;
    assessDecisionQuality(log: DecisionRunLog, plan: TripPlan | null, conflicts: ConstraintConflict[], feedbacks?: {
        planVariantFeedbacks?: PlanVariantFeedback[];
        conflictFeedbacks?: ConflictFeedback[];
        decisionQualityFeedback?: DecisionQualityFeedback;
    }): Promise<QualityAssessmentResult>;
    private assessPlanQuality;
    private assessConflictExplanationQuality;
    private assessTradeoffOptionsQuality;
    private assessDecisionSpeed;
    private assessUserSatisfaction;
    private calculateOverallQualityScore;
    private determineQualityGrade;
    private generateImprovementSuggestions;
}
