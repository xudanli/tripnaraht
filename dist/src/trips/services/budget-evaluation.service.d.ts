import { PrismaService } from '../../prisma/prisma.service';
import { TripBudgetService, BudgetConstraint } from './trip-budget.service';
export interface BudgetEvaluationRequest {
    planId: string;
    tripId: string;
    estimatedCost: number;
    categoryBreakdown: {
        accommodation: number;
        transportation: number;
        food: number;
        activities: number;
        other: number;
    };
    budgetConstraint: BudgetConstraint;
}
export interface BudgetEvaluationResponse {
    verdict: 'ALLOW' | 'NEED_ADJUST' | 'REJECT';
    reason: string;
    confidence: number;
    violations?: Array<{
        category: string;
        exceeded: number;
        percentage: number;
    }>;
    recommendations?: Array<{
        action: string;
        impact: string;
        estimatedSavings: number;
    }>;
    evidenceRefs?: string[];
}
export interface BudgetDecisionLogItem {
    id: string;
    timestamp: string;
    planId: string;
    verdict: 'ALLOW' | 'NEED_ADJUST' | 'REJECT';
    estimatedCost: number;
    budgetConstraint: BudgetConstraint;
    reason: string;
    evidenceRefs: string[];
    persona?: 'ABU';
}
export declare class BudgetEvaluationService {
    private prisma;
    private tripBudgetService;
    private readonly logger;
    private decisionLogs;
    constructor(prisma: PrismaService, tripBudgetService: TripBudgetService);
    evaluateBudget(request: BudgetEvaluationRequest): Promise<BudgetEvaluationResponse>;
    getBudgetDecisionLog(planId: string, tripId: string, limit?: number, offset?: number): Promise<{
        items: BudgetDecisionLogItem[];
        total: number;
    }>;
    getPlanBudgetEvaluation(planId: string, tripId: string): Promise<{
        planId: string;
        budgetEvaluation: BudgetEvaluationResponse;
        personaOutput?: {
            persona: 'ABU';
            verdict: 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';
            explanation: string;
            evidence: Array<{
                type: string;
                content: string;
            }>;
        };
    }>;
}
