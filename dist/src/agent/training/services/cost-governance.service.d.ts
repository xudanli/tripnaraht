export declare class CostGovernanceService {
    private readonly logger;
    private readonly budgets;
    private readonly costs;
    checkBudget(requestId: string, budgetType: 'TOKEN' | 'TOOL' | 'LATENCY', amount: number): Promise<{
        allowed: boolean;
        remaining: number;
        exceeded: boolean;
    }>;
    trackCost(requestId: string, budgetType: 'TOKEN' | 'TOOL' | 'LATENCY', amount: number, metadata?: Record<string, any>): Promise<void>;
    private getOrCreateBudget;
    setBudgetLimit(requestId: string, budgetType: 'TOKEN' | 'TOOL' | 'LATENCY', limit: number): void;
    getCostRecords(requestId: string): CostRecord[];
    getBudgetUsage(requestId: string, budgetType: 'TOKEN' | 'TOOL' | 'LATENCY'): Budget | null;
}
interface Budget {
    request_id: string;
    budget_type: 'TOKEN' | 'TOOL' | 'LATENCY';
    limit: number;
    used: number;
    created_at: number;
}
export interface CostRecord {
    request_id: string;
    budget_type: 'TOKEN' | 'TOOL' | 'LATENCY';
    amount: number;
    timestamp: number;
    metadata: Record<string, any>;
}
export {};
