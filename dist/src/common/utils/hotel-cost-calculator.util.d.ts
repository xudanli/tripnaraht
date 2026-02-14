export declare class HotelCostCalculator {
    static calculateTotalCost(roomRate: number, transportCost: number, commuteTimeMinutes: number, timeValuePerHour?: number): number;
    static calculateCostBreakdown(roomRate: number, transportCost: number, commuteTimeMinutes: number, timeValuePerHour?: number): {
        roomRate: number;
        transportCost: number;
        roundTripTransportCost: number;
        timeCost: number;
        totalCost: number;
        hiddenCost: number;
    };
    static estimateTransportCost(distanceKm: number, useTaxi?: boolean): number;
    static estimateCommuteTime(distanceKm: number, transportMode?: 'walk' | 'metro' | 'taxi' | 'bus'): number;
}
