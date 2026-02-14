import { ISODatetime } from '../world-model';
import { DemDecisionEvidence } from './dem-decision-evidence.interface';
import { WeatherDecisionEvidence } from './weather-decision-evidence.interface';
export type DecisionStep = 'ROUTE_DIRECTION' | 'PLAN_GENERATION' | 'PLAN_REPAIR' | 'FINALIZE' | 'REJECT';
export type DecisionPersona = 'ABU' | 'DR_DRE' | 'NEPTUNE';
export type DecisionAction = 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
export interface InputSnapshot {
    userIntent: {
        destination: string;
        startDate: string;
        durationDays: number;
        preferences?: {
            pace?: 'relaxed' | 'moderate' | 'intense';
            riskTolerance?: 'low' | 'medium' | 'high';
            intents?: Record<string, number>;
        };
    };
    country: string;
    month: number;
    riskTolerance?: 'low' | 'medium' | 'high';
}
export interface DecisionEvidence {
    dem?: DemDecisionEvidence[];
    weather?: WeatherDecisionEvidence[];
    compliance?: {
        roadAccess?: boolean;
        permitRequired?: boolean;
        guideRequired?: boolean;
        vehicleRequired?: string;
    };
}
export interface DecisionDetails {
    action: DecisionAction;
    target?: string;
    reasonCodes: string[];
    explanation: string;
    suggestedAlternatives?: string[];
}
export interface EnhancedDecisionLog {
    logId: string;
    tripId?: string;
    step: DecisionStep;
    persona: DecisionPersona;
    timestamp: ISODatetime;
    inputSnapshot: InputSnapshot;
    evidence: DecisionEvidence;
    decision: DecisionDetails;
    reasonCodes: string[];
    explanation: string;
    metadata?: {
        decisionTimeMs?: number;
        impactsFinalPlan?: boolean;
        routeDirectionId?: number;
    };
}
export interface PersonaLogStyle {
    keywords: string[];
    explanationTemplate: string;
    userExplanationTemplate: string;
}
export declare const PERSONA_LOG_STYLES: Record<DecisionPersona, PersonaLogStyle>;
