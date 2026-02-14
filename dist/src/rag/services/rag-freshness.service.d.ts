import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { McpToolsService } from './mcp-tools.service';
import { ParallelExecutorService } from './parallel-executor.service';
export declare enum ChunkCategory {
    RULES = "RULES",
    POI_HOURS = "POI_HOURS",
    POI_INFO = "POI_INFO",
    GATE = "GATE",
    WEATHER = "WEATHER",
    GENERAL = "GENERAL"
}
export declare enum FreshnessStatus {
    FRESH = "FRESH",
    STALE = "STALE",
    EXPIRED = "EXPIRED",
    VERIFYING = "VERIFYING"
}
export interface FreshnessRule {
    staleDays: number;
    mustVerify: boolean;
    verifyTool?: string;
}
export interface Chunk {
    id: string;
    chunkId: string;
    content: string;
    type: string;
    category?: ChunkCategory;
    lastVerified?: Date;
    metadata?: any;
    embedding?: number[];
}
export interface FreshnessMetadata {
    freshness: FreshnessStatus;
    lastVerified?: Date;
    staleDays?: number;
    verifyTool?: string;
    verifyError?: string;
}
export declare class RagFreshnessService {
    private readonly prisma;
    private readonly embeddingService;
    private readonly mcpTools;
    private readonly parallelExecutor?;
    private readonly logger;
    private readonly FRESHNESS_RULES;
    constructor(prisma: PrismaService, embeddingService: EmbeddingService, mcpTools: McpToolsService, parallelExecutor?: ParallelExecutorService);
    ensureFreshness(chunks: Chunk[], category: ChunkCategory): Promise<Chunk[]>;
    private verifyAndUpdateBatch;
    private verifyAndUpdate;
    private updateChunk;
    private daysSince;
    getFreshnessStats(params?: {
        category?: ChunkCategory;
    }): Promise<{
        totalChunks: number;
        byFreshness: Record<FreshnessStatus, number>;
        byCategory: Record<ChunkCategory, {
            total: number;
            fresh: number;
            stale: number;
            expired: number;
        }>;
        staleChunks: Array<{
            chunkId: string;
            category: ChunkCategory;
            staleDays: number;
            lastVerified?: Date;
        }>;
    }>;
    refreshStaleChunks(params?: {
        category?: ChunkCategory;
        force?: boolean;
    }): Promise<{
        refreshed: number;
        failed: number;
        skipped: number;
    }>;
    dailyFreshnessCheck(): Promise<void>;
}
