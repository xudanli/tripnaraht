import { LlmService } from '../../llm/services/llm.service';
import { ChunkRetrievalResult } from './chunk-retrieval.service';
export interface QueryExpansionParams {
    query: string;
    maxVariants?: number;
    useLLM?: boolean;
}
export interface ExpandedQuery {
    original: string;
    variants: string[];
    allQueries: string[];
}
export declare class QueryExpansionService {
    private readonly llmService?;
    private readonly logger;
    private readonly DEFAULT_MAX_VARIANTS;
    constructor(llmService?: LlmService);
    expandQuery(params: QueryExpansionParams): Promise<ExpandedQuery>;
    private expandWithLLM;
    private expandWithSynonyms;
    private buildExpansionPrompt;
    private getExpansionSchema;
    private parseExpansionResponse;
    mergeResults(resultsMap: Map<string, ChunkRetrievalResult[]>, originalQuery: string, limit: number): ChunkRetrievalResult[];
}
