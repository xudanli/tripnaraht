import { ILangGraphOrchestrator, LangGraphState, LangGraphNodeConfig } from './langgraph-orchestrator.interface';
import { PlannerAgentService } from './planner-agent.service';
import { NarratorAgentService } from './narrator-agent.service';
import { TripNaraCoreToolService } from '../tools/tripnara-core-tool.service';
export declare class LangGraphOrchestratorService implements ILangGraphOrchestrator {
    private readonly plannerAgent;
    private readonly narratorAgent;
    private readonly coreTool;
    private readonly logger;
    constructor(plannerAgent: PlannerAgentService, narratorAgent: NarratorAgentService, coreTool: TripNaraCoreToolService);
    execute(userQuery: string, context?: Record<string, any>): Promise<LangGraphState>;
    registerAgent(agentType: any, agent: any): void;
    getGraphStructure(): {
        nodes: LangGraphNodeConfig[];
        edges: Array<{
            from: string;
            to: string;
            condition?: string;
        }>;
    };
    private buildCoreToolInput;
}
