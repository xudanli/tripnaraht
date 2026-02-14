export declare class OptimizationRequirementsDto {
    slowerPace?: boolean;
    reduceBudget?: number;
    addActivities?: string[];
    removeActivities?: string[];
}
export declare class OptimizePlanRequestDto {
    sessionId?: string;
    planId: string;
    optimizationType?: 'pace' | 'budget' | 'route' | 'activities';
    requirements?: OptimizationRequirementsDto;
    language?: 'en' | 'zh';
}
