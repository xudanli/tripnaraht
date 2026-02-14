export type RiskCategory = 'SAFETY' | 'PHYSICAL' | 'TIME' | 'EXPERIENCE' | 'COST';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface CostRiskFactors {
    budgetOverrun?: {
        probability: number;
        estimatedOverrun: number;
        reasons: string[];
    };
    cancellationRisk?: {
        probability: number;
        cancellationFee: number;
        refundable: boolean;
        reasons: string[];
    };
    exchangeRateRisk?: {
        probability: number;
        estimatedImpact: number;
        currency: string;
        volatility: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    hiddenCosts?: {
        items: Array<{
            type: string;
            description: string;
            estimatedCost: number;
            probability: number;
        }>;
        totalEstimated: number;
    };
    peakSeasonSurcharge?: {
        isPeakSeason: boolean;
        surchargePercentage: number;
        estimatedAdditionalCost: number;
    };
}
export interface CostRiskAssessment {
    overallLevel: RiskLevel;
    overallScore: number;
    factors: CostRiskFactors;
    summary: string;
    recommendations: string[];
    estimatedCostRange: {
        min: number;
        max: number;
        base: number;
    };
}
export interface ExperienceRiskFactors {
    crowdingRisk?: {
        level: 'LOW' | 'MEDIUM' | 'HIGH';
        peakTimes: string[];
        estimatedWaitTime: number;
        impact: string;
    };
    maintenanceClosure?: {
        probability: number;
        closureDates?: string[];
        alternativeOptions?: string[];
        impact: string;
    };
    expectationGap?: {
        probability: number;
        potentialGaps: Array<{
            aspect: string;
            description: string;
            severity: RiskLevel;
        }>;
        impact: string;
    };
    seasonalExperienceRisk?: {
        currentSeason: string;
        optimalSeason: string;
        experienceDifference: string;
        impact: string;
    };
    weatherImpactRisk?: {
        weatherDependent: boolean;
        weatherSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
        impact: string;
    };
}
export interface ExperienceRiskAssessment {
    overallLevel: RiskLevel;
    overallScore: number;
    factors: ExperienceRiskFactors;
    summary: string;
    recommendations: string[];
    expectedExperienceQuality: {
        score: number;
        description: string;
    };
}
export type RiskMitigationStrategy = 'PREVENT' | 'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID';
export interface RiskMitigationMeasure {
    strategy: RiskMitigationStrategy;
    description: string;
    actions: string[];
    expectedEffect: string;
    implementationDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
    costImpact: number;
}
export interface RiskMitigationMatrix {
    riskCategory: RiskCategory;
    riskLevel: RiskLevel;
    recommendedStrategies: RiskMitigationStrategy[];
    measures: RiskMitigationMeasure[];
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
}
export interface ComprehensiveRiskAssessment {
    safety: {
        level: RiskLevel;
        score: number;
        details: string[];
    };
    physical: {
        level: RiskLevel;
        score: number;
        details: string[];
    };
    time: {
        level: RiskLevel;
        score: number;
        details: string[];
    };
    experience: ExperienceRiskAssessment;
    cost: CostRiskAssessment;
    overallLevel: RiskLevel;
    overallScore: number;
    mitigationMatrix: RiskMitigationMatrix[];
    formattedSummary: string;
}
