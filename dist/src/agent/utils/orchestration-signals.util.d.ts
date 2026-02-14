import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
export type TaskType = 'TRIP_PLANNING' | 'CRUD' | 'DATA_LOOKUP' | 'CUSTOMER_SUPPORT' | 'RAG_QA' | 'BOOKING_WORKFLOW' | 'GENERIC_QA';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ComplexityLevel = 'SIMPLE' | 'MODERATE' | 'COMPLEX';
export interface RoutingSignals {
    taskType: TaskType;
    risk: RiskLevel;
    needsAudit: boolean;
    latencyBudgetMs: number;
    complexity: ComplexityLevel;
    requiresStructuredOutput: boolean;
    expectsToolCalls: boolean;
    legacyWellSupported: boolean;
}
export declare function signalsFromRequest(req: RouteAndRunRequestDto): RoutingSignals;
