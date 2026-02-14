import { ConfigService } from '@nestjs/config';
import { TransportOption } from '../interfaces/transport.interface';
export declare class AmapRoutesService {
    private configService?;
    private readonly logger;
    private readonly apiKey;
    private readonly axiosInstance;
    private readonly baseUrl;
    constructor(configService?: ConfigService);
    getRoutes(fromLat: number, fromLng: number, toLat: number, toLng: number, travelMode?: 'transit' | 'walking' | 'driving', preferences?: {
        lessWalking?: boolean;
        avoidHighways?: boolean;
        avoidTolls?: boolean;
    }): Promise<TransportOption[]>;
    private parseAmapResponse;
    private generateTransitDescription;
    private estimateTaxiCost;
}
