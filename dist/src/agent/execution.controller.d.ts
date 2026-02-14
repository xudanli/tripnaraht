import { ExecutionAgentService, ExecutionAgentRequest } from './services/execution-agent.service';
import { ReorderRequestDto } from './dto/reorder.dto';
import { ApplyFallbackRequestDto } from './dto/apply-fallback.dto';
export declare class ExecutionController {
    private readonly executionAgent;
    private readonly logger;
    constructor(executionAgent: ExecutionAgentService);
    health(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        status: string;
        message: string;
    }>>;
    execute(request: ExecutionAgentRequest): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    reorder(request: ReorderRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    applyFallback(request: ApplyFallbackRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    previewFallback(solutionId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
