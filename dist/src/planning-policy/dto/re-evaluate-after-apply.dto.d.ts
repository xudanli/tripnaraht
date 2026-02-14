export declare class ReEvaluateAfterApplyDto {
    policy: any;
    appliedSchedule: any;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    poiLookup: Record<string, any>;
    reEvaluateSamples?: number;
    config?: {
        seed?: number;
    };
}
