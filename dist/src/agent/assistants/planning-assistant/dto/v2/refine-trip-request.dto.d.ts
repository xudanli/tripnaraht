export declare class RefineTripRequestDto {
    sessionId?: string;
    tripId: string;
    days?: number[];
    includeRestaurants?: boolean;
    includeTransport?: boolean;
    includeActivities?: boolean;
    language?: 'en' | 'zh';
}
