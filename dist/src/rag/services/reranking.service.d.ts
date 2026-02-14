import { LlmService } from '../../llm/services/llm.service';
import { ChunkRetrievalResult } from './chunk-retrieval.service';
export interface RerankingParams {
    query: string;
    results: ChunkRetrievalResult[];
    topK?: number;
    returnTop?: number;
    useLLM?: boolean;
}
export interface RerankingResult extends ChunkRetrievalResult {
    rerankScore?: number;
    rerankReason?: string;
}
export declare class RerankingService {
    private readonly llmService?;
    private readonly logger;
    private readonly DEFAULT_TOP_K;
    private readonly DEFAULT_RETURN_TOP;
    constructor(llmService?: LlmService);
    rerank(params: RerankingParams): Promise<RerankingResult[]>;
    private rerankWithLLM;
    private buildRerankingPrompt;
    private parseLLMResponse;
    private rerankByScore;
    private getRerankingSchema;
    rerankBatch(queries: Array<{
        query: string;
        results: ChunkRetrievalResult[];
    }>, topK?: number, returnTop?: number): Promise<RerankingResult[][]>;
}
