export declare class TripStateDto {
    currentDayId: string | null;
    currentItemId: string | null;
    nextStop?: {
        itemId: string;
        placeId: number;
        placeName: string;
        startTime: string;
        estimatedArrivalTime?: string;
    };
    eta?: string;
    timezone: string;
    now: string;
}
