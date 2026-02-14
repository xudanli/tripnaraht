import { CollaborationResult, CollaborationRequest } from '../interfaces/system-collaboration.interface';
import { System1ExecutorService } from './system1-executor.service';
import { RouterService } from './router.service';
import { DAGOrchestratorService } from '../plan-execute/orchestrator.service';
import { ClaudeOrchestratorService } from './claude-orchestrator.service';
import { OrchestratorService } from './orchestrator.service';
export declare class SystemCollaborationService {
    private readonly system1Executor;
    private readonly logger;
    private readonly defaultConfig;
    private readonly dagOrchestrator?;
    private readonly claudeOrchestrator?;
    private readonly legacyOrchestrator?;
    constructor(system1Executor: System1ExecutorService, routerService?: RouterService, dagOrchestrator?: DAGOrchestratorService, claudeOrchestrator?: ClaudeOrchestratorService, legacyOrchestrator?: OrchestratorService);
    executeCollaboration(request: CollaborationRequest): Promise<CollaborationResult>;
    private executeParallel;
    private executeSequential;
    private executeSingleSystem;
    private executeSystem1;
    private executeSystem2;
    private detectConflicts;
    private generateFinalRecommendation;
    private determineCollaborationMode;
    private shouldTriggerSystem2;
    private extractDataSources;
    private calculateDataSourceOverlap;
    private hasResultDivergence;
}
