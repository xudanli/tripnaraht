import { RoutePlanDraft } from '../shared/world-model.types';
export interface TripNaraCoreToolInput {
    countryCode: string;
    month: number;
    routeDirectionId: string;
    humanCapability: {
        maxDailyAscentM?: number;
        rollingAscent3DaysM?: number;
        maxSlopePct?: number;
        preferredPace?: 'SLOW' | 'MEDIUM' | 'FAST';
        riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
        highAltitudeExperience?: 'NONE' | 'BASIC' | 'ADVANCED';
        specialConstraints?: string[];
    };
    initialPlan?: RoutePlanDraft;
    metadata?: Record<string, any>;
}
export interface TripNaraCoreToolOutput {
    allowed: boolean;
    plan: RoutePlanDraft | null;
    action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
    logs: Array<{
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        action: string;
        explanation: string;
        decisionSource: 'PHYSICAL' | 'HUMAN' | 'PHILOSOPHY' | 'HEURISTIC';
    }>;
    explanation: string;
    metadata?: Record<string, any>;
}
export interface ITripNaraCoreTool {
    execute(input: TripNaraCoreToolInput): Promise<TripNaraCoreToolOutput>;
    getDescription(): string;
    getSchema(): Record<string, any>;
}
export declare class TripNaraCoreToolError extends Error {
    readonly code: 'INVALID_INPUT' | 'EXECUTION_FAILED' | 'TIMEOUT';
    readonly details?: Record<string, any>;
    constructor(message: string, code: 'INVALID_INPUT' | 'EXECUTION_FAILED' | 'TIMEOUT', details?: Record<string, any>);
}
