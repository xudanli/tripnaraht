import { AgentRunAdminService } from './services/agent-run-admin.service';
export declare class AgentAdminController {
    private readonly agentRunAdminService;
    private readonly logger;
    constructor(agentRunAdminService: AgentRunAdminService);
    getRunStats(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPerformance(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRuns(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRunDetail(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAttempts(query: any): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAttemptDetail(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    cancelRun(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
