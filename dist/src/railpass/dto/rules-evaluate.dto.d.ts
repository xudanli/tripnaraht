export declare class RulesEvaluateRequestDto {
    segments: any[];
    passProfile: any;
    reservationTasks?: any[];
    travelDayResult?: {
        totalDaysUsed: number;
        daysByDate: Record<string, any>;
    };
}
