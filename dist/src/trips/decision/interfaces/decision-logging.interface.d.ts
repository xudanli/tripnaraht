export type DecisionPointType = 'ROUTE_SELECTION' | 'RHYTHM_SELECTION' | 'RISK_ACKNOWLEDGMENT' | 'FINAL_CONFIRMATION';
export interface DecisionOption {
    optionId: string;
    name: string;
    description?: string;
    characteristics?: Record<string, any>;
    matchingAnalysis?: Record<string, any>;
    riskAssessment?: Record<string, any>;
    uncertainty?: Record<string, any>;
}
export interface UserChoice {
    optionId: string;
    selectionTime: Date;
    reasoning?: string;
    confidenceLevel?: number;
}
export interface SystemAnalysis {
    topRecommendation?: {
        optionId: string;
        rationale: string;
    };
    recommendationRationale?: string;
    alignmentWithUserChoice?: number;
}
export interface ExpectedOutcome {
    expectedCharacteristics?: Record<string, any>;
    expectedExperience?: string;
    expectedRisks?: string[];
    expectedSatisfaction?: number;
}
export interface ActualOutcome {
    actualCharacteristics?: Record<string, any>;
    actualExperience?: string;
    actualRisks?: string[];
    actualSatisfaction?: number;
}
export interface Deviation {
    type: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    description: string;
    magnitude: number;
    details?: Record<string, any>;
}
export interface LearningSignals {
    preferenceSignals?: Record<string, any>;
    decisionPatternSignals?: Record<string, any>;
    improvementSuggestions?: string[];
}
