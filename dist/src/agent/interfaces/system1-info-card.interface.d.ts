export type ReliabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type MatchLevel = 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW' | 'SUFFICIENT' | 'TIGHT' | 'INSUFFICIENT' | 'WITHIN' | 'SLIGHTLY_OVER' | 'OVER';
export type DifficultyLevel = 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type SeasonStatus = 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';
export type CrowdLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';
export interface CurrentConditions {
    weather: {
        condition: string;
        temperature: string;
        reliability: ReliabilityLevel;
    };
    crowd: {
        level: CrowdLevel;
        queueTime?: number;
        reliability: ReliabilityLevel;
    };
    season: {
        status: SeasonStatus;
        reliability: ReliabilityLevel;
    };
    transportation: {
        available: boolean;
        methods: string[];
        reliability: ReliabilityLevel;
    };
}
export interface YourMatch {
    fitnessRequirement: {
        vsYourFitness: MatchLevel;
        explanation: string;
    };
    timeRequirement: {
        vsYourTime: MatchLevel;
        explanation: string;
    };
    difficultyRequirement: {
        vsYourExperience: MatchLevel;
        explanation: string;
    };
    costRequirement: {
        vsYourBudget: MatchLevel;
        explanation: string;
    };
}
export interface RiskOverview {
    safetyRisk: RiskLevel;
    physicalRisk: RiskLevel;
    timeRisk: RiskLevel;
    experienceRisk: RiskLevel;
    costRisk: RiskLevel;
}
export interface System1InfoCard {
    routeName: string;
    distance: number;
    elevationGain: number;
    estimatedDuration: number;
    difficultyLevel: DifficultyLevel;
    currentConditions: CurrentConditions;
    yourMatch: YourMatch;
    riskOverview: RiskOverview;
    summary: string;
    routeId?: string;
    metadata?: Record<string, any>;
}
export interface System1Result {
    success: boolean;
    result: System1InfoCard | any;
    answerText: string | null;
    cardType?: 'INFO_CARD' | 'API_RESULT' | 'RAG_RESULT';
}
