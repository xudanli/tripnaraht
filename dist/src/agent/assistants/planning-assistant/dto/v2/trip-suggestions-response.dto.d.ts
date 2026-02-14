export declare class TripSuggestionDto {
    type: string;
    title: string;
    titleCN: string;
    description: string;
    descriptionCN: string;
    priority: 'low' | 'medium' | 'high';
    action: {
        type: string;
        label: string;
        labelCN: string;
        params: Record<string, any>;
    };
}
export declare class TripSuggestionsResponseDto {
    suggestions: TripSuggestionDto[];
    generatedAt: string;
}
