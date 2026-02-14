import { ConfigService } from '@nestjs/config';
export declare class AmapPOIService {
    private configService?;
    private readonly logger;
    private readonly apiKey;
    private readonly axiosInstance;
    private readonly baseUrl;
    constructor(configService?: ConfigService);
    getPOIDetails(name: string, lat: number, lng: number): Promise<{
        openingHours?: string;
        openingHoursStructured?: any;
        ticketPrice?: string;
        ticketPriceStructured?: any;
        type?: string;
        highlights?: string[];
        interestDimensions?: string[];
        amapId?: string;
        address?: string;
        tel?: string;
        website?: string;
        email?: string;
        postcode?: string;
    } | null>;
    searchPOIByName(name: string, city?: string): Promise<{
        lat: number;
        lng: number;
        amapId?: string;
        address?: string;
        name?: string;
        error?: string;
    } | null>;
    private searchPOI;
    private simplifyName;
    private getPOIDetail;
    private parseSearchResult;
    private parseDetailResult;
    private parseOpeningHours;
    private parseTimeRange;
    private parseTicketPrice;
    batchGetPOIDetails(pois: Array<{
        name: string;
        lat: number;
        lng: number;
    }>, batchSize?: number, delay?: number): Promise<Array<{
        name: string;
        lat: number;
        lng: number;
        data: {
            openingHours?: string;
            ticketPrice?: string;
            type?: string;
            highlights?: string[];
            interestDimensions?: string[];
            amapId?: string;
            address?: string;
            tel?: string;
            website?: string;
        } | null;
    }>>;
}
