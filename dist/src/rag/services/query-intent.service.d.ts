export type QueryIntentType = 'ROUTE' | 'WEATHER' | 'POI' | 'SAFETY' | 'RENTAL' | 'GENERAL';
export interface QueryIntent {
    type: QueryIntentType;
    confidence: number;
    suggestedChunkCategory?: string;
    expandedKeywords: string[];
    reasoning: string;
}
export declare class QueryIntentService {
    private readonly logger;
    classifyIntent(query: string): QueryIntent;
    expandKeywords(query: string, intentType: QueryIntentType): string[];
    enhanceQuery(query: string): string;
    shouldFilterByCategory(intent: QueryIntent): boolean;
}
