import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { LoaderService } from './loader.service';
import { ChunkingService } from './chunking.service';
export declare class IndexingService {
    private prisma;
    private loader;
    private chunking;
    private embedding;
    private readonly logger;
    constructor(prisma: PrismaService, loader: LoaderService, chunking: ChunkingService, embedding: EmbeddingService);
    indexAllKnowledgeBase(): Promise<void>;
    indexSingleFile(fileData: any): Promise<void>;
    private batchInsertChunks;
    clearIndex(): Promise<void>;
    rebuildIndex(): Promise<void>;
}
