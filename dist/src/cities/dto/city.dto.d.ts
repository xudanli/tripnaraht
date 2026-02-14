export declare class CityDto {
    id: number;
    name: string;
    countryCode: string;
    nameCN?: string;
    nameEN?: string;
    adcode?: string;
    timezone?: string;
    lat?: number;
    lng?: number;
    metadata?: any;
}
export declare class GetCitiesQueryDto {
    countryCode?: string;
    q?: string;
    limit?: number;
    offset?: number;
}
