import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';
export declare class RecommendationsResponseDto {
    recommendations: DestinationRecommendationDto[];
    sessionId?: string;
    preferencesUsed?: Record<string, any>;
    generatedAt: string;
}
