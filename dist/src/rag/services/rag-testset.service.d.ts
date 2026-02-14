import { PrismaService } from '../../prisma/prisma.service';
export interface RagEvalTestCase {
    id: string;
    query: string;
    groundTruthChunkIds: string[];
    notes?: string;
    tags?: string[];
}
export interface RagEvalTestset {
    version: number;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    testCases: RagEvalTestCase[];
}
export declare class RagTestsetService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private getTestsetPath;
    load(): Promise<RagEvalTestset>;
    save(testset: RagEvalTestset): Promise<void>;
    private validate;
    findRelevantChunks(query: string, limit?: number): Promise<Array<{
        id: string;
        chunkId: string;
        content: string;
        type: string;
        keywords: string[];
        filename: string;
        category: string;
        similarity?: number;
    }>>;
    listAllChunks(limit?: number): Promise<Array<{
        id: string;
        chunkId: string;
        content: string;
        type: string;
        keywords: string[];
        filename: string;
        category: string;
    }>>;
    private extractKeywords;
    private isStopWord;
}
