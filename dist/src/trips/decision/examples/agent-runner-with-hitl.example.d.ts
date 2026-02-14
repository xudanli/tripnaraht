import { AgentResumeService } from '../services/agent-resume.service';
export declare class AgentRunnerWithHitlExample {
    private readonly agentResumeService;
    private readonly logger;
    constructor(agentResumeService: AgentResumeService);
    runAgentLoop(threadId: string, userMessage: string): Promise<any>;
    resumeAgentAfterApproval(threadId: string, approvalId: string): Promise<any>;
    private loadMessageHistory;
    private callLLM;
    private executeTool;
}
