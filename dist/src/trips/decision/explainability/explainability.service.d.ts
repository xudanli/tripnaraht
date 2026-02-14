import { DecisionRunLog } from '../decision-log';
import { TripPlan } from '../plan-model';
import { CheckerViolation } from '../constraints';
import { PlanDiff } from '../plan-diff';
export interface ExplanationItem {
    type: 'reason' | 'warning' | 'suggestion' | 'change';
    title: string;
    message: string;
    details?: Record<string, any>;
    actionable?: boolean;
    actionType?: 'lock' | 'replace' | 'adjust' | 'accept';
}
export interface SlotExplanation {
    slotId: string;
    title: string;
    reasons: string[];
    warnings?: string[];
    suggestions?: string[];
    alternatives?: Array<{
        id: string;
        title: string;
        reason: string;
    }>;
}
export interface PlanExplanation {
    summary: string;
    whyThisPlan: ExplanationItem[];
    whyChanged?: ExplanationItem[];
    violations?: Array<{
        severity: 'error' | 'warning' | 'info';
        message: string;
        suggestions: string[];
    }>;
    slots: SlotExplanation[];
}
export declare class ExplainabilityService {
    private readonly logger;
    explainPlan(plan: TripPlan, log: DecisionRunLog, violations?: CheckerViolation[]): PlanExplanation;
    explainChanges(oldPlan: TripPlan, newPlan: TripPlan, diff: PlanDiff, log: DecisionRunLog): PlanExplanation;
    private explainSlot;
    private generateSummary;
    private getActionTitle;
    private getActionMessage;
    private mapActionType;
}
