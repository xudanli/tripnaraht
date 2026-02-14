import { PrismaService } from '../../prisma/prisma.service';
import { HotelRecommendationRequest, HotelRecommendation } from '../interfaces/hotel-strategy.interface';
import { HotelPriceService } from '../../hotels/services/hotel-price.service';
export declare class HotelRecommendationService {
    private prisma;
    private hotelPriceService;
    constructor(prisma: PrismaService, hotelPriceService: HotelPriceService);
    recommendHotels(request: HotelRecommendationRequest): Promise<HotelRecommendation[]>;
    private calculateTripDensity;
    private autoSelectStrategy;
    private getAttractions;
    private recommendByCentroid;
    private recommendByHub;
    private recommendByResort;
    private calculateAvgDistanceToAttractions;
    private calculateHaversineDistance;
    private extractCoordinatesSync;
    private toRadians;
    private formatRecommendations;
    recommendHotelOptions(request: HotelRecommendationRequest): Promise<{
        options: Array<{
            id: 'CONVENIENT' | 'COMFORTABLE' | 'BUDGET';
            name: string;
            description: string;
            pros: string[];
            cons: string[];
            hotels: HotelRecommendation[];
        }>;
        recommendation?: string;
        densityAnalysis?: {
            density: 'HIGH' | 'MEDIUM' | 'LOW';
            avgPlacesPerDay: number;
            totalDays: number;
            totalAttractions: number;
        };
    }>;
}
