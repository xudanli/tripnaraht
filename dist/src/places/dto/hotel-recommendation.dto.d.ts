import { HotelRecommendationStrategy } from '../interfaces/hotel-strategy.interface';
export declare class HotelRecommendationDto {
    tripId?: string;
    attractionIds?: number[];
    strategy?: HotelRecommendationStrategy;
    maxBudget?: number;
    minTier?: number;
    maxTier?: number;
    timeValuePerHour?: number;
    includeHiddenCost?: boolean;
}
