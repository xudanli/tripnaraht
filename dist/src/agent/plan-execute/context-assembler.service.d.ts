import { AgentStateService } from '../services/agent-state.service';
import { ContextSummary } from './types';
export declare class ContextAssemblerService {
    private readonly agentStateService?;
    private readonly logger;
    constructor(agentStateService?: AgentStateService);
    getSummary(threadId: string, userGoal?: string): Promise<ContextSummary>;
    private summarizeState;
    private extractCompletedSteps;
    private extractConstraints;
    private extractBudget;
    updateSummary(summary: ContextSummary, stepId: string, result: any): Promise<ContextSummary>;
    private mergeStateUpdate;
}
