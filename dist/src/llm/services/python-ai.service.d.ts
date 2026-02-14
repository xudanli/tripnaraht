import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export interface EmbeddingRequest {
    texts: string[];
    model?: string;
    encoding_format?: 'float' | 'base64';
    return_sparse?: boolean;
    return_colbert?: boolean;
}
export interface SparseVector {
    tokens: number[];
    weights: number[];
}
export interface EmbeddingResult {
    dense: number[];
    sparse?: SparseVector;
    colbert?: number[][];
}
export interface EmbeddingResponse {
    embeddings: EmbeddingResult[];
    usage: {
        total_tokens: number;
    };
    model: string;
}
export interface RerankDocument {
    id: string;
    text: string;
}
export interface RerankRequest {
    query: string;
    documents: RerankDocument[];
    top_k?: number;
    model?: string;
}
export interface RerankResult {
    id: string;
    score: number;
    rank: number;
}
export interface RerankResponse {
    results: RerankResult[];
    usage: {
        total_tokens: number;
    };
}
export interface BatchTaskStatus {
    task_id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    result_url?: string;
    error?: string;
}
export interface HealthCheckResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    version?: string;
    service?: string;
    models?: {
        embedding?: string;
        reranker?: string;
    };
    gpu_available?: boolean;
    [key: string]: any;
}
export declare class PythonAIService implements OnModuleInit {
    private configService;
    private readonly logger;
    private readonly http;
    private readonly circuitBreaker;
    private readonly baseUrl;
    private readonly timeout;
    private readonly healthCheckTimeout;
    private readonly enabled;
    private isHealthy;
    constructor(configService: ConfigService);
    onModuleInit(): Promise<void>;
    isAvailable(): boolean;
    getServiceStatus(): {
        enabled: boolean;
        healthy: boolean;
        baseUrl: string;
        circuitBreakerState: string;
        isAvailable: boolean;
    };
    checkHealth(): Promise<HealthCheckResponse>;
    generateEmbeddings(texts: string[], options?: {
        returnSparse?: boolean;
        returnColbert?: boolean;
    }): Promise<EmbeddingResult[]>;
    generateEmbedding(text: string, options?: {
        returnSparse?: boolean;
    }): Promise<number[]>;
    rerank(query: string, documents: RerankDocument[], topK?: number): Promise<RerankResult[]>;
    createBatchEmbeddingTask(texts: string[], batchSize?: number, callbackUrl?: string): Promise<string>;
    getBatchTaskStatus(taskId: string): Promise<BatchTaskStatus>;
    getEmbeddingDimension(): number;
    getCircuitBreakerState(): string;
    private handleError;
}
