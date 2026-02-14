import { AirbnbService } from './airbnb.service';
import { AirbnbMonitoringService } from './airbnb-monitoring.service';
import { AirbnbSearchDto } from './dto/airbnb-search.dto';
export declare class AirbnbController {
    private readonly airbnbService;
    private readonly monitoring;
    private readonly logger;
    constructor(airbnbService: AirbnbService, monitoring: AirbnbMonitoringService);
    search(dto: AirbnbSearchDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getListingDetails(listingId: string, checkin?: string, checkout?: string, adults?: number, children?: number, infants?: number, pets?: number, ignoreRobotsText?: boolean): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkAuthStatus(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAuthorizationUrl(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    verifyAuthorization(connectionId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getStats(days?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkCostLimit(dailyLimit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
