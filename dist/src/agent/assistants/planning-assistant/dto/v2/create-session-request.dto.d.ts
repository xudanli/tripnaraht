export declare class SessionContextDto {
    tripId?: string;
    destination?: string;
    preferences?: {
        budget?: {
            total: number;
            currency: string;
        };
        travelers?: {
            adults: number;
            children?: number;
        };
        dateRange?: {
            startDate: string;
            endDate: string;
        };
        activities?: string[];
        travelStyle?: string;
    };
}
export declare class CreateSessionRequestDto {
    userId?: string;
    context?: SessionContextDto;
}
