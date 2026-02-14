export declare class RobustnessConfigDto {
    samples?: number;
    seed: number;
    onTimeSlackMin?: number;
}
export declare class BudgetStrategyDto {
    baseSamples?: number;
    candidateSamples?: number;
    confirmSamples?: number;
}
export declare class OptimizationSuggestionDto {
    type: 'SHIFT_EARLIER' | 'REORDER_AVOID_WAIT' | 'UPGRADE_TRANSIT';
    poiId: string;
    minutes?: number;
    reason?: string;
}
export declare class EvaluateWhatIfReportDto {
    policy: any;
    schedule: any;
    dayEndMin: number;
    dateISO: string;
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    poiLookup?: Record<string, any>;
    placeIds?: number[];
    config?: RobustnessConfigDto;
    suggestions?: OptimizationSuggestionDto[];
    budgetStrategy?: BudgetStrategyDto;
}
