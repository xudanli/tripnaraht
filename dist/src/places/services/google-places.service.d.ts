import { ConfigService } from '@nestjs/config';
export declare class GooglePlacesService {
    private configService?;
    private readonly logger;
    private readonly axiosInstance;
    private readonly apiKey;
    private readonly baseUrl;
    constructor(configService?: ConfigService);
    fetchAttractionsByCountry(countryCode: string, tourismTypes?: string[], timeoutMs?: number): Promise<GooglePlacesPOI[]>;
    private searchPlacesInCity;
    private searchPlacesNearby;
    private searchPlacesByText;
    private getCityCoordinates;
    private buildMergedQuery;
    private buildSearchQuery;
    private getCountryInfo;
    private mapPlaceType;
    private getMajorCitiesByCountry;
    private mapGooglePlaceToPoi;
    private extractCategory;
    private extractType;
    private hashStringToNumber;
    private deduplicatePois;
}
export interface GooglePlacesPOI {
    placeId: string;
    countryCode: string;
    rawResult: Record<string, any>;
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
