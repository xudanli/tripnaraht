import { PlanNode, DropReasonCode, DroppedNode } from '../interfaces/plan-request.interface';
export declare class ExplanationService {
    generateDropExplanation(node: PlanNode, reasonCode: DropReasonCode, context?: {
        arrivalTime?: number;
        closeTime?: number;
        waitMinutes?: number;
        requiredDeparture?: number;
        slackMinutes?: number;
        dayEnd?: number;
        hardNodeCount?: number;
        robustTimeInfeasible?: boolean;
    }): DroppedNode['explanation'];
    private explainTimeWindowConflict;
    generatePathExplanation(fromNode: PlanNode, toNode: PlanNode, skippedNode: PlanNode, reason: string): string;
    private minutesToTimeString;
}
