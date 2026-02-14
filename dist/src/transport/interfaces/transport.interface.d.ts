export declare enum TransportMode {
    WALKING = "WALKING",
    TRANSIT = "TRANSIT",
    TAXI = "TAXI",
    RAIL = "RAIL",
    BUS = "BUS",
    FLIGHT = "FLIGHT"
}
export interface TransportOption {
    mode: TransportMode;
    durationMinutes: number;
    cost: number;
    walkDistance: number;
    transfers?: number;
    score?: number;
    recommendationReason?: string;
    warnings?: string[];
    description?: string;
}
export interface UserContext {
    hasLuggage: boolean;
    hasElderly: boolean;
    isRaining: boolean;
    budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    timeSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    hasLimitedMobility?: boolean;
    currentCity?: string;
    targetCity?: string;
    isMovingDay?: boolean;
}
export interface TransportRecommendation {
    options: TransportOption[];
    recommendationReason: string;
    specialAdvice?: string[];
}
