export declare class PacingConfigDto {
    maxDailyActivities?: number;
    restIntervalHours?: number;
    level?: 'relaxed' | 'standard' | 'tight';
}
export declare class ConstraintsDto {
    dailyWalkLimit?: number;
    earlyRiser?: boolean;
    nightOwl?: boolean;
    mustPlaces?: number[];
    avoidPlaces?: number[];
}
export declare class UpdateIntentRequestDto {
    pacingConfig?: PacingConfigDto;
    preferences?: string[];
    constraints?: ConstraintsDto;
    planningPolicy?: 'safe' | 'experience' | 'challenge';
    totalBudget?: number;
}
export declare class BudgetConfigDto {
    totalBudget: number;
    currency?: string;
}
export declare class IntentResponseDto {
    id: string;
    pacingConfig?: PacingConfigDto;
    budgetConfig?: BudgetConfigDto;
    metadata?: {
        preferences?: string[];
        constraints?: ConstraintsDto;
        planningPolicy?: string;
    };
}
export declare class UpdateIntentResponseDto {
    success: boolean;
    trip: IntentResponseDto;
    metadata?: {
        preferences?: string[];
        constraints?: ConstraintsDto;
        planningPolicy?: string;
    };
}
