import { AgentState } from '../interfaces/agent-state.interface';
import { ActionRegistryService } from './action-registry.service';
export declare class ActionDependencyAnalyzerService {
    private actionRegistry;
    private readonly logger;
    constructor(actionRegistry: ActionRegistryService);
    findParallelizableActions(candidateActions: Array<{
        name: string;
        input: any;
    }>, state: AgentState): Array<{
        name: string;
        input: any;
    }>[];
    private analyzeActionDependency;
    private inferSideEffects;
    private canExecuteInParallel;
    private pathOverlaps;
}
