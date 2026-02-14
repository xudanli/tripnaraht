import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { TravelReadinessResult } from '../readiness/types/readiness-checklist.types';
export declare class GeneratePlanRequestDto {
    state: TripWorldState;
}
export declare class GeneratePlanResponseDto {
    plan: TripPlan;
    log: any;
    decisionLogs?: Array<{
        persona: 'ABU' | 'DR_DRE' | 'NEPTUNE';
        action: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE';
        explanation: string;
        reasonCodes: string[];
        timestamp: string;
    }>;
    routeDirectionExplanation?: string;
    readiness?: TravelReadinessResult;
}
export declare class RepairPlanRequestDto {
    state: TripWorldState;
    plan: TripPlan;
    trigger?: string;
}
export declare class ExplainPlanRequestDto {
    plan: TripPlan;
    log: any;
    violations?: any[];
}
export declare class ExplainPlanResponseDto {
    explanation: any;
}
export declare class LearnFromLogsRequestDto {
    logs: any[];
    userFeedback?: Array<{
        logId: string;
        accepted: boolean;
        satisfaction?: number;
    }>;
}
export declare class LearnFromLogsResponseDto {
    result: any;
}
export declare class EvaluatePlanRequestDto {
    state: TripWorldState;
    plan: TripPlan;
    constraintResult: any;
    diff?: any;
}
export declare class EvaluatePlanResponseDto {
    metrics: any;
}
export declare class CheckAdvancedConstraintsRequestDto {
    plan: TripPlan;
    constraints: {
        mutexGroups: Array<{
            groupId: string;
            maxSelect: number;
            description?: string;
        }>;
        dependencies: Array<{
            from: string;
            to: string;
            type: 'before' | 'after' | 'same_day' | 'adjacent';
            minGapMinutes?: number;
        }>;
    };
}
export declare class MonitoringMetricsResponseDto {
    metrics: any;
    alerts: any[];
}
