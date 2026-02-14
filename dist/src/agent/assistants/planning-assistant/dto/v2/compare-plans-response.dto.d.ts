export declare class PlanComparisonDto {
    id: string;
    name: string;
    nameCN: string;
    scores: Record<string, number>;
}
export declare class ComparisonDifferenceDto {
    field: string;
    plan1Value: any;
    plan2Value: any;
    impact: 'low' | 'medium' | 'high';
    description?: string;
    descriptionCN?: string;
}
export declare class ComparisonRecommendationDto {
    bestBudget?: string;
    bestRoute?: string;
    bestTime?: string;
    summary?: string;
    summaryCN?: string;
}
export declare class ComparePlansResponseDto {
    plans: PlanComparisonDto[];
    dimensions: string[];
    differences: ComparisonDifferenceDto[];
    recommendation: ComparisonRecommendationDto;
}
