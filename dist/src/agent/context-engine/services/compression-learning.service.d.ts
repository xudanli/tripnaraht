import { PrismaService } from '../../../prisma/prisma.service';
import { ContextBlock } from '../types/context-package.types';
import { ContextLearningInput } from './context-learning.service';
export interface CompressionLearning {
    blockKey: string;
    blockType: string;
    compressionScore: number;
    omissionScore: number;
    sampleSize: number;
    confidence: number;
}
export interface CompressionStrategy {
    compress: ContextBlock[];
    omit: ContextBlock[];
    keep: ContextBlock[];
}
export declare class CompressionLearningService {
    private readonly prisma?;
    private readonly logger;
    private readonly compressionCache;
    private readonly cacheTtl;
    constructor(prisma?: PrismaService);
    learnCompressionStrategy(event: ContextLearningInput): Promise<void>;
    private updateCompressionScore;
    getCompressionStrategy(blocks: ContextBlock[], userId?: string, phase?: string, agent?: string): Promise<CompressionStrategy>;
    private cleanExpiredCache;
}
