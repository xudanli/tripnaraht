import { PlanningWorkbenchAgentService } from '../services/planning-workbench-agent.service';
import { ExecutionAgentService } from '../services/execution-agent.service';
import { TripDetailAgentService } from '../services/trip-detail-agent.service';
export type CoreActionType = 'generatePlan' | 'comparePlans' | 'evaluatePlan' | 'selectPlan' | 'applyChangeIntent' | 'rollback' | 'checkpoint' | 'diagnose' | 'getTripStatus';
export interface ActionBudget {
    maxDurationMs: number;
    maxLlmTokens: number;
    maxToolCalls: number;
    priority: 'low' | 'normal' | 'high' | 'critical';
}
export interface CoreAction {
    type: CoreActionType;
    payload: Record<string, unknown>;
    context: {
        userId: string;
        sessionId: string;
        traceId?: string;
        budget?: Partial<ActionBudget>;
    };
}
export interface CoreActionResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta: {
        traceId: string;
        actionType: CoreActionType;
        durationMs: number;
        budgetUsed: {
            durationMs: number;
            llmTokens: number;
            toolCalls: number;
        };
        degraded: boolean;
    };
}
export interface ChangeIntent {
    intentId: string;
    type: 'destination' | 'schedule' | 'activity' | 'accommodation' | 'transport' | 'cancel' | 'add';
    target: {
        itemId?: string;
        dayIndex?: number;
        timeSlot?: string;
    };
    from?: unknown;
    to: unknown;
    constraints: {
        mustKeep?: string[];
        budget?: number;
        timeLimit?: string;
    };
    reason: string;
    urgency: 'low' | 'normal' | 'high' | 'immediate';
    userConfirmed: boolean;
}
export declare class CoreGatewayService {
    private readonly planningWorkbench?;
    private readonly executionAgent?;
    private readonly tripDetailAgent?;
    private readonly logger;
    private actionStats;
    constructor(planningWorkbench?: PlanningWorkbenchAgentService, executionAgent?: ExecutionAgentService, tripDetailAgent?: TripDetailAgentService);
    execute<T = unknown>(action: CoreAction): Promise<CoreActionResult<T>>;
    generatePlan(params: {
        userId: string;
        sessionId: string;
        destination: string;
        preferences: Record<string, unknown>;
        constraints?: Record<string, unknown>;
    }): Promise<CoreActionResult>;
    applyChangeIntent(params: {
        userId: string;
        tripId: string;
        intent: ChangeIntent;
    }): Promise<CoreActionResult>;
    getTripStatus(params: {
        userId: string;
        tripId: string;
    }): Promise<CoreActionResult>;
    diagnose(params: {
        userId: string;
        tripId: string;
        diagnosticType?: 'health' | 'budget' | 'schedule' | 'full';
    }): Promise<CoreActionResult>;
    getStats(): Record<string, any>;
    private validateAction;
    private resolveBudget;
    private routeAction;
    private routeToPlanningCore;
    private mapActionToUserAction;
    private routeToExecutionCore;
    private mapActionToExecAction;
    private routeToTripDetail;
    private getDefaultPlanningResponse;
    private getDefaultExecutionResponse;
    private getDefaultDiagnosticResponse;
    private generateTraceId;
}
