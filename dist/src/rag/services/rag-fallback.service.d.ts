import { ChunkRetrievalService, ChunkRetrievalParams, ChunkRetrievalResult } from './chunk-retrieval.service';
import { PrismaService } from '../../prisma/prisma.service';
import { McpToolsService } from './mcp-tools.service';
export declare enum QueryCategory {
    RULES = "RULES",
    GATE = "GATE",
    POI = "POI",
    SPATIAL = "SPATIAL",
    GENERAL = "GENERAL"
}
export interface QueryContext {
    category: QueryCategory;
    requiresCitation?: boolean;
    allowWebBrowse?: boolean;
    userIntent?: string;
}
export interface RagResult {
    results: ChunkRetrievalResult[];
    method: 'VECTOR_RAG' | 'HYBRID_RAG' | 'KEYWORD_FALLBACK' | 'WEB_BROWSE' | 'GRACEFUL_FAILURE';
    confidence: number;
    fallback?: {
        message: string;
        officialLinks?: string[];
        recordedInGapLog: boolean;
    };
    metadata?: {
        attemptedMethods: string[];
        degradationReason?: string;
        latency?: number;
    };
}
export interface KnowledgeGapLog {
    query: string;
    category: QueryCategory;
    timestamp: Date;
    attemptedMethods: string[];
    source?: string;
    needsIndex: boolean;
    notes?: string;
}
export declare class RagFallbackService {
    private readonly chunkRetrievalService;
    private readonly prisma;
    private readonly mcpTools;
    private readonly logger;
    private readonly THRESHOLDS;
    constructor(chunkRetrievalService: ChunkRetrievalService, prisma: PrismaService, mcpTools: McpToolsService);
    queryWithFallback(query: string, params: ChunkRetrievalParams, context: QueryContext): Promise<RagResult>;
    private keywordSearch;
    private extractKeywords;
    private isStopWord;
    private webBrowseSearch;
    private getOfficialLinks;
    private recordKnowledgeGap;
    getKnowledgeGapStats(params?: {
        category?: QueryCategory;
        startDate?: Date;
        endDate?: Date;
        limit?: number;
    }): Promise<{
        totalGaps: number;
        byCategory: Record<QueryCategory, number>;
        topQueries: Array<{
            query: string;
            count: number;
        }>;
        needsIndexCount: number;
    }>;
}
