import { TripDetailAgentService, TripDetailAgentRequest } from './services/trip-detail-agent.service';
export declare class TripDetailController {
    private readonly tripDetailAgent;
    constructor(tripDetailAgent: TripDetailAgentService);
    execute(request: TripDetailAgentRequest): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getStatus(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getMetricExplanation(tripId: string, dimension: 'schedule' | 'budget' | 'pace' | 'feasibility'): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getHealth(tripId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    private generateMetricExplanation;
}
