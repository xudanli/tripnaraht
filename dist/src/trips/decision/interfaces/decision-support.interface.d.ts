export interface RouteOption {
    routeId: string | number;
    routeName: string;
    systemAnalysis: SystemAnalysis;
    metadata?: {
        countryCode?: string;
        tags?: string[];
        [key: string]: any;
    };
}
export interface SystemAnalysis {
    characteristics: {
        distance?: number;
        elevationGain?: number;
        estimatedDuration?: number;
        difficultyLevel: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
        seasonSuitability: 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';
        experienceTypes: string[];
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    };
    matchingAnalysis: {
        fitnessMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
        timeMatch: 'SUFFICIENT' | 'TIGHT' | 'INSUFFICIENT';
        experienceMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
        costMatch: 'WITHIN' | 'SLIGHTLY_OVER' | 'OVER' | 'BELOW';
    };
    riskAssessment: {
        safetyRisk: 'LOW' | 'MEDIUM' | 'HIGH';
        physicalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
        timeRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    };
}
export interface RouteComparison {
    dimensions: Array<{
        name: string;
        values: Record<string, string | number>;
    }>;
    comparisonNote: string;
}
export interface DecisionOptions {
    options: RouteOption[];
    comparison: RouteComparison;
    userGuidance?: string | {
        message?: string;
        considerations?: string[];
        [key: string]: any;
    };
}
export interface UserWantItem {
    item: string;
    matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH';
    explanation?: string;
}
export interface UserWant {
    items: UserWantItem[];
    matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH' | Record<string, 'MATCH' | 'PARTIAL' | 'MISMATCH'>;
}
export interface UserConcernItem {
    item: string;
    addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED';
    explanation?: string;
}
export interface UserConcern {
    items: UserConcernItem[];
    addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED' | Record<string, 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED'>;
}
export interface MatchingAnalysis {
    whatYouWant: {
        items: UserWantItem[];
        matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH' | Record<string, 'MATCH' | 'PARTIAL' | 'MISMATCH'>;
    };
    yourConcerns: {
        items: UserConcernItem[];
        addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED' | Record<string, 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED'>;
    };
    overallJudgment: {
        statement: string;
        factors?: string[];
        confidence: number;
    };
    nextSteps: Array<{
        action: string;
        reason: string;
        optional?: boolean;
    }>;
}
export interface RhythmOption {
    type: 'RELAXED' | 'NORMAL' | 'TIGHT';
    rhythmId?: string;
    rhythmName?: string;
    description?: string;
    characteristics?: Record<string, any>;
    systemAnalysis?: {
        suitability: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
        explanation?: string;
    };
}
export interface RhythmComparison {
    dimensions: Array<{
        name: string;
        values: Record<string, string | number>;
    }>;
    comparisonNote: string;
}
export interface ConditionalSupport {
    scenarios: ConditionalScenario[];
    userQuestions?: string[];
    systemAnswers?: string[];
}
export interface ConditionalScenario {
    scenarioId?: string;
    scenarioName?: string;
    condition: string;
    outcome?: string;
    probability?: number;
    explanation?: string;
    suggestion?: string;
    applicableRoutes?: string[];
}
export interface DecisionInterface {
    routeSelection: {
        options: RouteOption[];
        comparison: RouteComparison;
    };
    rhythmSelection: {
        options: RhythmOption[];
        comparison: RhythmComparison;
    };
    conditionalSupport: ConditionalSupport;
}
