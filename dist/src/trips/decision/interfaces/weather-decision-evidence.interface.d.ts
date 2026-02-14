export type WeatherViolationType = 'HARD' | 'SOFT' | 'NONE';
export interface WeatherDecisionEvidence {
    segmentId: string;
    date: string;
    windSpeed: number;
    windDirection: number;
    precipitation: number;
    visibility: number;
    temperatureDrop: number;
    crosswindRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
    violation: WeatherViolationType;
    explanation: string;
    suggestedAction?: 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED';
    metadata?: {
        weatherWindowAvailable?: boolean;
        forecastReliability?: 'HIGH' | 'MEDIUM' | 'LOW';
        historicalRiskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
    };
}
export interface WeatherEvidencePipelineResult {
    segmentEvidences: WeatherDecisionEvidence[];
    hasHardViolation: boolean;
    hasSoftViolation: boolean;
    canProceed: boolean;
    explainableFailure?: {
        reason: string;
        affectedDays: number[];
        userImpact: string;
    };
}
export interface WeatherDecisionRules {
    maxWindSpeed?: number;
    maxCrosswindSpeed?: number;
    maxPrecipitation?: number;
    minVisibility?: number;
    maxTemperatureDrop?: number;
    weatherWindowRequired?: boolean;
}
