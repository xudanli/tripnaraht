export declare class TravelTimeByModeDto {
    walking: number;
    driving: number;
    transit: number;
    train: number;
    flight: number;
    ferry: number;
    bicycle: number;
    taxi: number;
}
export declare class DayMetricsResponseDto {
    date: string;
    metrics: {
        walk: number;
        drive: number;
        buffer: number;
        fatigue: number;
        ascent: number;
        cost: number;
        travelByMode: TravelTimeByModeDto;
        totalTravelTime: number;
        totalDistance: number;
    };
    conflicts: Array<{
        type: 'TIME_CONFLICT' | 'LUNCH_WINDOW' | 'FATIGUE_EXCEEDED' | 'BUFFER_INSUFFICIENT';
        severity: 'HIGH' | 'MEDIUM' | 'LOW';
        title: string;
        description: string;
        affectedItemIds: string[];
    }>;
}
export declare class TripMetricsSummaryDto {
    totalWalk: number;
    totalDrive: number;
    totalBuffer: number;
    totalFatigue: number;
    totalCost: number;
    averageWalkPerDay: number;
    averageDrivePerDay: number;
}
export declare class TripMetricsResponseDto {
    tripId: string;
    days: DayMetricsResponseDto[];
    summary: TripMetricsSummaryDto;
}
