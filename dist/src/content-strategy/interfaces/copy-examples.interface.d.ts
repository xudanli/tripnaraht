export type ScenarioType = 'FIRST_TIME_USER' | 'ROUTE_COMPARISON' | 'LONELINESS_CONCERN' | 'WEATHER_RISK' | 'PHYSICAL_RISK' | 'BUDGET_CONCERN' | 'TIME_CONSTRAINT' | 'DECISION_HESITATION' | 'SUCCESS_CONFIRMATION' | 'REJECTION_RESPONSE';
export type ErrorType = 'SYSTEM_ERROR' | 'NETWORK_ERROR' | 'DATA_NOT_FOUND' | 'VALIDATION_ERROR' | 'PERMISSION_DENIED' | 'TIMEOUT_ERROR' | 'RATE_LIMIT' | 'MAINTENANCE';
export interface FirstTimeUserCopy {
    firstScreenCopy: string;
    firstQuestion: string;
    guidance: string[];
}
export interface RouteComparisonCopy {
    comparison: {
        routes: Array<{
            name: string;
            strengths: string[];
            considerations: string[];
        }>;
        summary: string;
    };
    suggestion: {
        message: string;
        reflection: string[];
    };
}
export interface LonelinessConcernCopy {
    empathy: string;
    clarification: string;
    socialOpportunities: string[];
}
export interface WeatherRiskCopy {
    situation: string;
    possibilities: string[];
    preparations: string[];
    empowerment: string;
}
export interface ErrorCopy {
    title: string;
    description: string;
    possibleReasons: string[];
    suggestions: string[];
    supportInfo?: string;
}
export interface ExceptionCopy {
    type: string;
    userFriendlyMessage: string;
    technicalDetails?: string;
    nextSteps: string[];
}
