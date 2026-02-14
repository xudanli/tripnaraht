import { AmadeusService } from './amadeus.service';
import { AmadeusSearchFlightOffersDto } from './dto/amadeus-search.dto';
export declare class AmadeusController {
    private readonly amadeusService;
    private readonly logger;
    constructor(amadeusService: AmadeusService);
    searchFlights(dto: AmadeusSearchFlightOffersDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    ping(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    checkAuthStatus(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getAuthorizationUrl(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    verifyAuthorization(connectionId: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
