export declare class PersonaEvaluationDto {
    adventurer: {
        score: number;
        comment: string;
        commentCN: string;
    };
    planner: {
        score: number;
        comment: string;
        commentCN: string;
    };
    relaxer: {
        score: number;
        comment: string;
        commentCN: string;
    };
}
export declare class PlanCandidateDto {
    id: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    destination: string;
    duration: number;
    highlights: string[];
    estimatedBudget: {
        total: number;
        breakdown: {
            flight: number;
            accommodation: number;
            activities: number;
            food: number;
            other: number;
        };
        currency: string;
    };
    pace: 'relaxed' | 'moderate' | 'intensive';
    suitability: {
        score: number;
        reasons: string[];
    };
    personas?: PersonaEvaluationDto;
    explanation?: {
        whyRecommended: string;
        whyRecommendedCN: string;
        strengths: string[];
        strengthsCN: string[];
        considerations: string[];
        considerationsCN: string[];
    };
    optimizationTips?: {
        tip: string;
        tipCN: string;
        impact: 'low' | 'medium' | 'high';
    }[];
    warnings?: string[];
}
