import { TripNARAWorkflowDraft, ExecutionPlan } from '../interfaces/chain-of-work.interface';
export declare class ExecutionPlanGeneratorService {
    private readonly logger;
    generatePlan(draft: TripNARAWorkflowDraft): Promise<ExecutionPlan>;
    private calculateDependencies;
    private identifyParallelGroups;
}
