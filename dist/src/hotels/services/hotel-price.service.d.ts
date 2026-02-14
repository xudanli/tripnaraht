import { PrismaService } from '../../prisma/prisma.service';
export declare class HotelPriceService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    estimatePrice(city: string, starRating: number, year?: number, quarter?: number): Promise<{
        estimatedPrice: number;
        lowerBound: number;
        upperBound: number;
        basePrice: number;
        cityStarFactor: number;
        quarterPrice?: number;
        sampleCount: number;
    }>;
    getCityStarOptions(city: string): Promise<Array<{
        starRating: number;
        avgPrice: number;
        cityStarFactor: number;
        sampleCount: number;
        minPrice: number | null;
        maxPrice: number | null;
    }>>;
    getQuarterlyTrend(city: string, starRating?: number): Promise<Array<{
        year: number;
        quarter: number;
        price: number;
    }>>;
    recommendHotels(city: string, starRating: number, minPrice?: number, maxPrice?: number, limit?: number): Promise<Array<{
        id: string;
        name: string;
        brand: string | null;
        address: string | null;
        district: string | null;
        lat: number | null;
        lng: number | null;
        phone: string | null;
    }>>;
    estimatePriceWithRecommendations(city: string, starRating: number, year?: number, quarter?: number, includeRecommendations?: boolean, recommendationLimit?: number): Promise<{
        estimatedPrice: number;
        lowerBound: number;
        upperBound: number;
        basePrice: number;
        cityStarFactor: number;
        quarterPrice?: number;
        sampleCount: number;
        recommendations?: Array<{
            id: string;
            name: string;
            brand: string | null;
            address: string | null;
            district: string | null;
            lat: number | null;
            lng: number | null;
            phone: string | null;
        }>;
    }>;
}
