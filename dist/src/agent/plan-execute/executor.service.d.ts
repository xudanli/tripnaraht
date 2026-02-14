import { ActionRegistryService } from '../services/action-registry.service';
import { PlanTask, PlanStep, ExecutionResult } from './types';
export declare class ExecutorService {
    private readonly actionRegistry?;
    private readonly logger;
    constructor(actionRegistry?: ActionRegistryService);
    executeStep(step: PlanTask | PlanStep, memory: Record<string, any>, context: any): Promise<ExecutionResult>;
    private parseStepDescription;
    private extractToolName;
    private extractInput;
    private generateSummary;
    private shouldTriggerReplan;
}
