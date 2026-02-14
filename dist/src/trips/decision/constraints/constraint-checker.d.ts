import { TripWorldState, ISODate } from '../world-model';
import { TripPlan } from '../plan-model';
import { ConstraintConflictResolver } from './constraint-conflict-resolver.service';
import { ConstraintConflictResult } from './constraint-dsl.types';
export type ViolationSeverity = 'error' | 'warning' | 'info';
export interface CheckerViolation {
    code: string;
    severity: ViolationSeverity;
    date?: ISODate;
    slotId?: string;
    activityId?: string;
    message: string;
    details?: Record<string, any>;
    suggestions?: string[];
}
export interface InfeasibilityReason {
    constraint: string;
    description: string;
    affected_activities?: Array<{
        activity: string;
        message: string;
    }>;
    fix_suggestions: string[];
}
export interface InfeasibilityExplanation {
    feasible: boolean;
    reasons: InfeasibilityReason[];
    summary?: string;
}
export interface ConstraintCheckResult {
    violations: CheckerViolation[];
    isValid: boolean;
    summary: {
        errorCount: number;
        warningCount: number;
        infoCount: number;
    };
    conflicts?: ConstraintConflictResult;
    infeasibilityExplanation?: InfeasibilityExplanation;
}
export declare class ConstraintChecker {
    private readonly conflictResolver?;
    constructor(conflictResolver?: ConstraintConflictResolver);
    checkPlan(state: TripWorldState, plan: TripPlan): Promise<ConstraintCheckResult>;
    explainInfeasibility(violations: CheckerViolation[], state: TripWorldState): InfeasibilityExplanation;
    private groupViolationsByType;
    private checkReadinessConstraints;
    private checkTimeWindows;
    private checkConnectivity;
    private checkBudget;
    private checkPhysicalConstraints;
    private checkWeatherFeasibility;
    private checkGlobalBudget;
    private timeToMinutes;
}
