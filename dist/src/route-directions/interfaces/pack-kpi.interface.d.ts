export interface RouteDirectionPersonalityKPI {
    routeDirectionId: string;
    name: string;
    tagUniquenessScore: number;
    constraintUniquenessScore: number;
    riskProfileUniquenessScore: number;
    overallPersonalityScore: number;
    analysis: {
        uniqueTags: string[];
        uniqueConstraints: string[];
        uniqueRiskFeatures: string[];
    };
}
export interface ConstraintCombinationKPI {
    totalCombinations: number;
    uniqueCombinations: number;
    diversityScore: number;
    combinations: Array<{
        id: string;
        description: string;
        routeDirectionCount: number;
        constraints: {
            hard?: Record<string, any>;
            soft?: Record<string, any>;
        };
    }>;
}
export interface UserPreferenceDifferentiationKPI {
    totalScenarios: number;
    differentiatedScenarios: number;
    differentiationScore: number;
    scenarios: Array<{
        scenarioId: string;
        description: string;
        preferences: {
            pace?: 'relaxed' | 'moderate' | 'intense';
            riskTolerance?: 'low' | 'medium' | 'high';
            intents?: Record<string, number>;
        };
        results: Array<{
            countryCode: string;
            selectedRouteDirectionId: string;
            selectedRouteDirectionName: string;
            score: number;
        }>;
        isDifferentiated: boolean;
        differentiationReason?: string;
    }>;
}
export interface PackKPIAcceptanceResult {
    countryCode: string;
    countryName: string;
    acceptanceTime: string;
    passed: boolean;
    overallScore: number;
    personalityKPI: {
        averagePersonalityScore: number;
        minPersonalityScore: number;
        maxPersonalityScore: number;
        passed: boolean;
        details: RouteDirectionPersonalityKPI[];
    };
    constraintCombinationKPI: {
        diversityScore: number;
        passed: boolean;
        details: ConstraintCombinationKPI;
    };
    userPreferenceDifferentiationKPI: {
        differentiationScore: number;
        passed: boolean;
        details: UserPreferenceDifferentiationKPI;
    };
    issues: string[];
    recommendations: string[];
}
