import { CostRiskAssessment, ExperienceRiskAssessment, RiskMitigationMatrix, ComprehensiveRiskAssessment, RiskCategory, RiskLevel } from '../interfaces/enhanced-risk-assessment.interface';
import { RouteDirectionData } from '../interfaces/route-direction.interface';
export declare class EnhancedRiskAssessmentService {
    private readonly logger;
    assessCostRisk(route: RouteDirectionData, context?: {
        budget?: number;
        travelDate?: string;
        currency?: string;
        travelerCount?: number;
    }): Promise<CostRiskAssessment>;
    assessExperienceRisk(route: RouteDirectionData, context?: {
        travelDate?: string;
        travelerPreferences?: string[];
    }): Promise<ExperienceRiskAssessment>;
    generateMitigationMatrix(riskCategory: RiskCategory, riskLevel: RiskLevel, riskDetails: any): RiskMitigationMatrix;
    assessComprehensiveRisk(route: RouteDirectionData, context?: {
        budget?: number;
        travelDate?: string;
        currency?: string;
        travelerCount?: number;
        travelerPreferences?: string[];
    }): Promise<ComprehensiveRiskAssessment>;
    private assessBudgetOverrunRisk;
    private assessCancellationRisk;
    private assessExchangeRateRisk;
    private assessHiddenCosts;
    private assessPeakSeasonSurcharge;
    private calculateCostRiskScore;
    private generateCostRiskSummary;
    private generateCostRiskRecommendations;
    private estimateCostRange;
    private assessCrowdingRisk;
    private assessMaintenanceClosureRisk;
    private assessExpectationGapRisk;
    private assessSeasonalExperienceRisk;
    private assessWeatherImpactRisk;
    private calculateExperienceRiskScore;
    private generateExperienceRiskSummary;
    private generateExperienceRiskRecommendations;
    private assessExpectedExperienceQuality;
    private selectMitigationStrategies;
    private generateMitigationMeasures;
    private determinePriority;
    private assessSafetyRisk;
    private assessPhysicalRisk;
    private assessTimeRisk;
    private calculateOverallRiskScore;
    private formatRiskSummary;
    private scoreToRiskLevel;
    private estimateRouteCost;
    private getSeasonName;
}
