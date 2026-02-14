export declare class SolutionChangesDto {
    time?: string;
    distance?: string;
    cost?: string;
    risk?: 'increase' | 'decrease' | 'same';
}
export declare class SolutionPreviewDto {
    affectedItems?: string[];
    newPlan?: any;
}
export declare class SolutionDto {
    id: string;
    title: string;
    description: string;
    type: 'replace' | 'adjust' | 'alternative' | 'manual';
    changes?: SolutionChangesDto;
    reasonCode?: string;
    evidenceLink?: string;
    autoApplicable: boolean;
    preview?: SolutionPreviewDto;
}
export declare class GetSolutionsResponseDto {
    blockerId: string;
    blockerMessage: string;
    solutions: SolutionDto[];
}
