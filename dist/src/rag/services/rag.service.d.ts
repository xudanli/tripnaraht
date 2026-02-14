import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RagRetrievalParams, RagRetrievalResult, DocumentIndexItem } from '../interfaces/rag.interface';
export declare class RagService {
    private readonly prisma;
    private readonly embeddingService;
    private readonly logger;
    constructor(prisma: PrismaService, embeddingService: EmbeddingService);
    retrieve(params: RagRetrievalParams): Promise<RagRetrievalResult[]>;
    private fallbackKeywordSearch;
    indexDocument(item: DocumentIndexItem): Promise<string>;
    indexDocuments(items: DocumentIndexItem[]): Promise<string[]>;
    deleteDocument(id: string): Promise<void>;
    updateDocument(id: string, item: Partial<DocumentIndexItem>): Promise<void>;
    getDocuments(params: {
        collection?: string;
        countryCode?: string;
        tags?: string[];
        search?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        documents: Array<{
            id: string;
            collection: string;
            title: string;
            content: string;
            source: string | null;
            countryCode: string | null;
            tags: string[];
            metadata: any;
            createdAt: Date;
            updatedAt: Date;
            fileId?: string;
            chunksCount?: number;
        }>;
        pagination: {
            page: number;
            pageSize: number;
            total: number;
            totalPages: number;
        };
    }>;
    getDocument(id: string): Promise<{
        id: string;
        collection: string;
        title: string;
        content: string;
        source: string | null;
        countryCode: string | null;
        tags: string[];
        metadata: any;
        createdAt: Date;
        updatedAt: Date;
        fileId?: string;
        chunksCount?: number;
        chunks?: Array<{
            id: string;
            chunkId: string;
            content: string;
            type: string;
            similarity?: number;
        }>;
    } | null>;
    getStats(collection?: string): Promise<{
        totalDocuments: number;
        collections: Array<{
            name: string;
            count: number;
            countries: string[];
        }>;
        byCollection?: {
            name: string;
            count: number;
            countries: string[];
            tags: string[];
        };
    }>;
}
