import { WorldBuildContextSkill } from './world-build-context.skill';
import { WorldModelMonitoringService } from './services/world-model-monitoring.service';
export declare class WorldController {
    private readonly worldBuildContextSkill;
    private readonly monitoringService?;
    constructor(worldBuildContextSkill: WorldBuildContextSkill, monitoringService?: WorldModelMonitoringService);
    buildContext(input: {
        tripId?: string;
        countryCode?: string;
        season?: number;
        duration?: number;
        partyProfile?: {
            mobilityProfile?: string;
            riskTolerance?: 'low' | 'medium' | 'high';
            fitness?: 'low' | 'medium' | 'high';
            pace?: 'relaxed' | 'moderate' | 'intense';
        };
        routeDirectionId?: string;
    }): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
    getMetrics(): Promise<import("../../common/dto/standard-response.dto").StandardResponse<any>>;
}
