import { ConfigService } from '@nestjs/config';
export declare class MapboxService {
    private configService?;
    private readonly logger;
    private readonly axiosInstance;
    private readonly accessToken;
    private readonly baseUrl;
    constructor(configService?: ConfigService);
    fetchAttractionsByCountry(countryCode: string, tourismTypes?: string[]): Promise<MapboxPOI[]>;
    private getMajorCitiesByCountry;
    private getCityBounds;
    private getCountryBounds;
    private buildSearchQuery;
    private searchInBbox;
    private mapMapboxFeatureToPoi;
    private hashStringToNumber;
    private deduplicatePois;
}
export interface MapboxPOI {
    mapboxId: string;
    countryCode?: string;
    rawProperties: Record<string, any>;
    rawContext: any[];
    osmId: number;
    osmType: 'node' | 'way' | 'relation';
    name: string;
    nameEn?: string;
    lat: number;
    lng: number;
    category: string;
    type: string;
    rawTags: Record<string, string>;
}
