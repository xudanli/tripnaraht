export declare class OverpassService {
    private readonly logger;
    private readonly axiosInstance;
    private readonly baseUrl;
    constructor();
    fetchAttractionsByCountry(countryCode: string, tourismTypes?: string[]): Promise<OverpassPOI[]>;
    private buildQuery;
    private mapOverpassElementToPoi;
}
export interface OverpassPOI {
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
