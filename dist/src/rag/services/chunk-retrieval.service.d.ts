import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RerankingService } from './reranking.service';
import { RAGMonitoringService } from './rag-monitoring.service';
import { QueryExpansionService } from './query-expansion.service';
import { QueryIntentService } from './query-intent.service';
import { RedisService } from '../../redis/redis.service';
import { ParallelExecutorService } from './parallel-executor.service';
export interface ChunkRetrievalResult {
    id: string;
    chunkId: string;
    content: string;
    type: string;
    credibilityScore: number;
    keywords: string[];
    metadata: any;
    fileId: string;
    similarity: number;
    sourceFile?: string;
    denseScore?: number;
    sparseScore?: number;
    hybridScore?: number;
    rerankScore?: number;
    rerankReason?: string;
}
export interface ChunkRetrievalParams {
    query: string;
    limit?: number;
    credibilityMin?: number;
    type?: string;
    category?: string;
    chunkCategory?: string;
    fileId?: string;
    useHybridSearch?: boolean;
    denseWeight?: number;
    sparseWeight?: number;
    sparseLimit?: number;
    useReranking?: boolean;
    rerankTopK?: number;
    useQueryExpansion?: boolean;
    maxQueryVariants?: number;
    useIntentClassification?: boolean;
}
export declare class ChunkRetrievalService {
    private readonly prisma;
    private readonly embeddingService;
    private readonly rerankingService?;
    private readonly monitoringService?;
    private readonly queryExpansionService?;
    private readonly queryIntentService?;
    private readonly redisService?;
    private readonly parallelExecutor?;
    private readonly logger;
    private readonly resultCache;
    private readonly l1CacheTtl;
    private readonly l2CacheTtl;
    private readonly cacheKeyPrefix;
    private readonly inFlightRetrievals;
    constructor(prisma: PrismaService, embeddingService: EmbeddingService, rerankingService?: RerankingService, monitoringService?: RAGMonitoringService, queryExpansionService?: QueryExpansionService, queryIntentService?: QueryIntentService, redisService?: RedisService, parallelExecutor?: ParallelExecutorService);
    retrieve(params: ChunkRetrievalParams): Promise<ChunkRetrievalResult[]>;
    private doRetrieve;
    private retrieveWithExpansion;
    private denseRetrieve;
    private hybridRetrieve;
    private sparseRetrieve;
    private mergeWithRRF;
    private readonly SYNONYM_MAP;
    private readonly INTENT_BOOST;
    private extractKeywords;
    private isStopWord;
    private formatResults;
    hybridRetrieveLegacy(params: ChunkRetrievalParams & {
        useLegacy?: boolean;
    }): Promise<ChunkRetrievalResult[]>;
    private buildCacheKey;
    private simpleHash;
    private getCachedResult;
    private writeToCache;
    private cleanExpiredCache;
    batchRetrieve(queries: ChunkRetrievalParams[], options?: {
        maxConcurrency?: number;
        taskTimeout?: number;
    }): Promise<Map<string, ChunkRetrievalResult[]>>;
}
