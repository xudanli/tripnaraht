export interface TimeValueCalculationContext {
    totalBudget?: number;
    tripDays?: number;
    travelerCount?: number;
    travelers?: Array<{
        type: 'ADULT' | 'ELDERLY' | 'CHILD';
        mobilityTag?: string;
    }>;
    avgPlacesPerDay?: number;
    timeSensitivity?: 'HIGH' | 'MEDIUM' | 'LOW';
    tripType?: 'BUSINESS' | 'LEISURE' | 'FAMILY' | 'BACKPACKING';
}
export declare class TimeValueCalculator {
    static calculateTimeValue(context: TimeValueCalculationContext): number;
    private static calculateBaseValue;
    private static getTravelerMultiplier;
    private static getDensityMultiplier;
    private static getSensitivityMultiplier;
    private static getTripTypeMultiplier;
    static calculateFromTrip(tripId: string, prisma: {
        trip: {
            findUnique: (args: any) => Promise<any>;
        };
    }): Promise<number>;
    private static inferTimeSensitivity;
    private static inferTripType;
}
