export declare class DestinationRecommendationDto {
    id: string;
    countryCode: string;
    name: string;
    nameCN: string;
    description: string;
    descriptionCN: string;
    highlights: string[];
    highlightsCN: string[];
    matchScore: number;
    matchReasons: string[];
    matchReasonsCN: string[];
    estimatedBudget: {
        min: number;
        max: number;
        currency: string;
    };
    bestSeasons: string[];
    imageUrl?: string;
    tags: string[];
}
