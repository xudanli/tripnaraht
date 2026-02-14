import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TransportOption } from '../interfaces/transport.interface';
export declare class GoogleRoutesService implements OnModuleInit {
    private configService?;
    private readonly logger;
    private readonly apiKey;
    private axiosInstance?;
    private readonly baseURL;
    private consecutiveFailures;
    private readonly maxConsecutiveFailures;
    private isCircuitOpen;
    private circuitOpenUntil;
    private readonly circuitResetMs;
    constructor(configService?: ConfigService);
    onModuleInit(): Promise<void>;
    private getAxiosInstance;
    getRoutes(fromLat: number, fromLng: number, toLat: number, toLng: number, travelMode?: 'TRANSIT' | 'WALKING' | 'DRIVING', preferences?: {
        lessWalking?: boolean;
        avoidHighways?: boolean;
        avoidTolls?: boolean;
    }): Promise<TransportOption[]>;
    private parseGoogleRoutesResponse;
    private estimateCostFromRoute;
    private generateDescription;
}
