import { DecisionRunLog } from '../decision-log';
import { PolicyProfile } from '../config/objective-config';
export interface LearningMetrics {
    adoptionRate: number;
    stabilityScore: number;
    executabilityRate: number;
    satisfactionScore?: number;
}
export interface LearningResult {
    policyAdjustments: Partial<PolicyProfile>;
    confidence: number;
    sampleSize: number;
    recommendations: string[];
}
export declare class LearningService {
    private readonly logger;
    learnFromLogs(logs: DecisionRunLog[], userFeedback?: Array<{
        logId: string;
        accepted: boolean;
        satisfaction?: number;
    }>): LearningResult;
    private calculateMetrics;
    private analyzePatterns;
    private generateAdjustments;
    private calculateConfidence;
    private generateRecommendations;
}
