import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { IcelandFRoadService } from '../data-contracts/services/iceland-froad.service';
import { IcelandComprehensiveService } from '../data-contracts/services/iceland-comprehensive.service';
import { IcelandSafetyAdapter } from '../data-contracts/adapters/iceland-safety.adapter';
export declare class IcelandInfoController {
    private readonly dataSourceRouter;
    private readonly icelandFRoadService?;
    private readonly icelandComprehensive?;
    private readonly icelandSafetyAdapter?;
    constructor(dataSourceRouter: DataSourceRouterService, icelandFRoadService?: IcelandFRoadService, icelandComprehensive?: IcelandComprehensiveService, icelandSafetyAdapter?: IcelandSafetyAdapter);
    getRoadConditions(fRoads?: string, status?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getWeather(region?: string, lat?: string, lng?: string, includeWindDetails?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getSafety(region?: string, alertType?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
