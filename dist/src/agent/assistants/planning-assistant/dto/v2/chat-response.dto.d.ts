import { SuggestedActionDto } from './shared/suggested-action.dto';
import { DestinationRecommendationDto } from './shared/destination-recommendation.dto';
import { PlanCandidateDto } from './shared/plan-candidate.dto';
import { HotelDto } from './shared/hotel.dto';
export type RoutingTarget = 'recommendations' | 'generate' | 'compare' | 'hotel' | 'airbnb' | 'accommodation' | 'restaurant' | 'flight' | 'rail' | 'carRental' | 'weather' | 'search' | 'translate' | 'currency' | 'image' | 'chat';
export declare class RoutingInfoDto {
    target: RoutingTarget;
    reason: string;
    params?: Record<string, any>;
}
export declare class ChatResponseDto {
    message: string;
    messageCN: string;
    reply?: string;
    replyCN?: string;
    phase: string;
    routing?: RoutingInfoDto;
    suggestedActions?: SuggestedActionDto[];
    sessionId?: string;
    recommendations?: DestinationRecommendationDto[];
    plans?: PlanCandidateDto[];
    hotels?: HotelDto[];
    airbnbListings?: any[];
    restaurants?: any[];
    weather?: any;
    searchResults?: any[];
    flights?: any[];
    railRoutes?: any[];
    carRentals?: any[];
    translation?: any;
    currencyConversion?: any;
    images?: any[];
}
