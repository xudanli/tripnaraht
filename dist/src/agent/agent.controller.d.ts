import { AgentService } from './services/agent.service';
import { RouteAndRunRequestDto, RouteAndRunResponseDto } from './dto/route-and-run.dto';
export declare class AgentController {
    private readonly agentService;
    constructor(agentService: AgentService);
    routeAndRun(request: RouteAndRunRequestDto): Promise<RouteAndRunResponseDto>;
}
