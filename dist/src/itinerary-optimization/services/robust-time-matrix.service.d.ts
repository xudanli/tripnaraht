import { PlanNode, RobustTimeMatrix } from '../interfaces/plan-request.interface';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { RouteCacheService } from '../../transport/services/route-cache.service';
export declare class RobustTimeMatrixService {
    private smartRoutesService;
    private routeCacheService;
    private readonly logger;
    constructor(smartRoutesService: SmartRoutesService, routeCacheService: RouteCacheService);
    computeRobustTimeMatrix(nodes: PlanNode[], transportPolicy?: {
        buffer_factor?: number;
        fixed_buffer_min?: number;
        switch_cost_min?: Record<string, number>;
        cross_region_cost_min?: number;
    }): Promise<RobustTimeMatrix>;
    private getApiTime;
    private calculateSwitchCost;
    private inferTravelMode;
    private calculateCrossRegionPenalty;
    private fallbackEstimateTime;
    private calculateDistance;
    private toRadians;
}
