export declare enum HotelRecommendationStrategy {
    CENTROID = "CENTROID",
    HUB = "HUB",
    RESORT = "RESORT"
}
export interface LocationScore {
    center_distance_km?: number;
    nearest_station_walk_min?: number;
    is_transport_hub?: boolean;
    avg_distance_to_attractions_km?: number;
    transport_convenience_score?: number;
}
export interface HotelRecommendationRequest {
    tripId?: string;
    attractionIds?: number[];
    strategy?: HotelRecommendationStrategy;
    maxBudget?: number;
    minTier?: number;
    maxTier?: number;
    timeValuePerHour?: number;
    includeHiddenCost?: boolean;
}
export interface HotelRecommendation {
    hotelId: number;
    name: string;
    roomRate: number;
    tier: number;
    locationScore?: LocationScore;
    totalCost?: number;
    costBreakdown?: {
        roomRate: number;
        transportCost: number;
        timeCost: number;
        hiddenCost: number;
        totalCost: number;
    };
    recommendationReason: string;
    distanceToCenter?: number;
}
