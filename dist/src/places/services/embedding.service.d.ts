import { ConfigService } from '@nestjs/config';
import { EmbeddingCacheService } from '../../rag/services/embedding-cache.service';
import { PythonAIService } from '../../llm/services/python-ai.service';
export type EmbeddingProvider = 'python' | 'openai';
export declare class EmbeddingService {
    private configService?;
    private embeddingCacheService?;
    private pythonAIService?;
    private readonly logger;
    private readonly provider;
    private readonly openaiApiKey?;
    private readonly embeddingDimension;
    private readonly openaiHttp;
    private readonly inFlightRequests;
    constructor(configService?: ConfigService, embeddingCacheService?: EmbeddingCacheService, pythonAIService?: PythonAIService);
    generateEmbedding(text: string): Promise<number[]>;
    getCurrentProvider(): EmbeddingProvider;
    private generateEmbeddingInternal;
    private generateOpenAIEmbedding;
    generateEmbeddingsBatch(texts: string[], batchSize?: number, retries?: number): Promise<number[][]>;
    getEmbeddingDimension(provider?: EmbeddingProvider): number;
    getConfiguredDimension(): number;
    isPythonAIAvailable(): boolean;
}
