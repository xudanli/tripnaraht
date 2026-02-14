export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export interface PlanTask {
    id: string;
    description: string;
    toolCategory?: string;
    dependencies: string[];
    status: TaskStatus;
    result?: string;
    outputData?: any;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    metadata?: Record<string, any>;
}
export type PlanStep = PlanTask;
export type PlanStepStatus = TaskStatus;
export interface ExecutionResult {
    summary: string;
    fullData: any;
    success: boolean;
    error?: string;
    shouldReplan?: boolean;
}
export interface ReplanResult {
    hasUpdates: boolean;
    newPlan: PlanStep[];
    reasoning?: string;
    changes?: {
        added: number;
        removed: number;
        modified: number;
    };
}
export interface ExecutionState {
    tasks: PlanTask[];
    memory: Record<string, any>;
    contextSummary: string;
}
export interface OrchestrationResult {
    status: 'done' | 'failed' | 'timeout' | 'deadlock';
    plan: PlanTask[];
    memory: Record<string, any>;
    summary?: string;
    error?: string;
}
export interface ContextSummary {
    threadId: string;
    userGoal: string;
    currentState: string;
    completedSteps: string[];
    constraints: Record<string, any>;
    budget?: {
        total: number;
        spent: number;
        remaining: number;
    };
}
