export interface RagRetrievalResult {
    id: string;
    content: string;
    title?: string;
    source?: string;
    score: number;
    metadata?: Record<string, any>;
}
export interface RagRetrievalParams {
    query: string;
    collection: string;
    limit?: number;
    countryCode?: string;
    tags?: string[];
    minScore?: number;
}
export interface DocumentIndexItem {
    id?: string;
    collection: string;
    title: string;
    content: string;
    source?: string;
    countryCode?: string;
    tags?: string[];
    metadata?: Record<string, any>;
}
