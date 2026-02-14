import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
export declare class RAGQueryCollectorService {
    private readonly prisma;
    private readonly ragService;
    private readonly logger;
    constructor(prisma: PrismaService, ragService: RagService);
    collectQueryDocumentPair(query: string, correctDocumentIds: string[], metadata?: {
        source?: string;
        userId?: string;
        sessionId?: string;
        timestamp?: Date;
        collection?: string;
        countryCode?: string;
        tags?: string[];
    }): Promise<string>;
    collectFromUserQuery(query: string, retrievedResults: Array<{
        id: string;
        score: number;
    }>, userFeedback?: {
        clickedDocumentIds?: string[];
        relevantDocumentIds?: string[];
        irrelevantDocumentIds?: string[];
    }): Promise<string | null>;
    collectBatch(pairs: Array<{
        query: string;
        correctDocumentIds: string[];
        metadata?: {
            source?: string;
            userId?: string;
            sessionId?: string;
            collection?: string;
            countryCode?: string;
            tags?: string[];
        };
    }>): Promise<string[]>;
    getCollectedPairs(options?: {
        source?: string;
        collection?: string;
        countryCode?: string;
        limit?: number;
    }): Promise<Array<{
        id: string;
        query: string;
        correctDocumentIds: string[];
        metadata: any;
    }>>;
    exportForEvaluation(pairs: Array<{
        query: string;
        correctDocumentIds: string[];
    }>): Promise<Array<{
        query: string;
        ground_truth_document_ids: string[];
    }>>;
}
