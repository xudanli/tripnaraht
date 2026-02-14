import { RailPassProfile, RailSegment, ReservationTask } from '../interfaces/railpass.interface';
export type RuleSeverity = 'error' | 'warning' | 'info';
export interface RuleEffect {
    type: 'TRAVEL_DAY_CONSUMPTION' | 'BUDGET_IMPACT' | 'HARD_CONSTRAINT' | 'RISK_LEVEL' | 'FALLBACK_REQUIRED';
    value?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    fallbackOptions?: string[];
    errorMessage?: string;
}
export interface RuleEvidence {
    source: string;
    reference?: string;
    version?: string;
}
export interface RailPassRule {
    id: string;
    name: string;
    condition: (args: RuleConditionArgs) => boolean;
    effect: RuleEffect;
    severity: RuleSeverity;
    evidence: RuleEvidence;
    description: string;
}
export interface RuleConditionArgs {
    segment: RailSegment;
    passProfile: RailPassProfile;
    reservationTask?: ReservationTask;
    allSegments?: RailSegment[];
    travelDayResult?: {
        totalDaysUsed: number;
        daysByDate: Record<string, any>;
    };
    isLastDayOfValidity?: boolean;
}
export interface RuleEvaluationResult {
    triggeredRules: Array<{
        rule: RailPassRule;
        segmentId: string;
        effect: RuleEffect;
        message: string;
    }>;
    hasErrors: boolean;
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}
export declare class RailPassRuleEngineService {
    private readonly logger;
    private readonly rules;
    constructor();
    private initializeRules;
    evaluateRules(args: {
        segments: RailSegment[];
        passProfile: RailPassProfile;
        reservationTasks?: ReservationTask[];
        travelDayResult?: {
            totalDaysUsed: number;
            daysByDate: Record<string, any>;
        };
    }): RuleEvaluationResult;
    private generateRuleMessage;
    getAllRules(): RailPassRule[];
    getRuleById(ruleId: string): RailPassRule | undefined;
}
