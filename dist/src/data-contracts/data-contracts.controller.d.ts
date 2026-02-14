import { DataSourceRouterService } from './services/data-source-router.service';
import { IcelandFRoadService } from './services/iceland-froad.service';
export declare class DataContractsController {
    private readonly dataSourceRouter;
    private readonly icelandFRoadService?;
    constructor(dataSourceRouter: DataSourceRouterService, icelandFRoadService?: IcelandFRoadService);
    getRoadStatus(lat: string, lng: string, radius?: string, includeFRoadInfo?: string, includeRiverCrossing?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRoadStatusByFRoads(fRoads: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
