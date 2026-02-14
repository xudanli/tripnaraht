export declare class TransportPlanDto {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
    hasLuggage?: boolean;
    hasElderly?: boolean;
    isRaining?: boolean;
    budgetSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
    timeSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
    hasLimitedMobility?: boolean;
    currentCity?: string;
    targetCity?: string;
    isMovingDay?: boolean;
}
