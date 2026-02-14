import { TransportPlanDto } from './dto/transport-plan.dto';
import { TransportRoutingService } from './transport-routing.service';
export declare class TransportController {
    private readonly routingService;
    constructor(routingService: TransportRoutingService);
    planRoute(dto: TransportPlanDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
