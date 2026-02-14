import { LlmService } from '../llm/services/llm.service';
export interface PlannerRequest {
    userQuery: string;
    userId?: string;
}
export interface PlannerResponse {
    plan?: any;
    skillsUsed: string[];
    decisionLog: Array<{
        skill: string;
        input: any;
        output: any;
    }>;
    explanation: string;
}
export declare class PlannerAgentMcpService {
    private readonly llmService;
    private readonly logger;
    constructor(llmService: LlmService);
    plan(request: PlannerRequest): Promise<PlannerResponse>;
}
